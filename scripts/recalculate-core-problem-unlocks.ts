import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { calculateCoreProblemStatus, hasLectureVideos } from '../src/lib/progression';

type PreparedProblem = {
    id: string;
    dependencyCoreProblemIds: string[];
};

type PreparedCoreProblem = {
    id: string;
    name: string;
    order: number;
    lectureVideos: unknown;
    problems: PreparedProblem[];
};

type PreparedSubject = {
    id: string;
    name: string;
    coreProblems: PreparedCoreProblem[];
};

function getEntryCoreProblemId(coreProblems: PreparedCoreProblem[]): string | null {
    if (coreProblems.length === 0) return null;
    return coreProblems[0].id;
}

function computeUnlockedCoreProblemIdsForSubject(
    subject: PreparedSubject,
    userProblemStateMap: Map<string, { isCleared: boolean }>
): Set<string> {
    const unlockedCoreProblemIds = new Set<string>();
    const entryCoreProblemId = getEntryCoreProblemId(subject.coreProblems);
    if (!entryCoreProblemId) return unlockedCoreProblemIds;

    unlockedCoreProblemIds.add(entryCoreProblemId);

    for (let index = 0; index < subject.coreProblems.length; index++) {
        const coreProblem = subject.coreProblems[index];
        if (!unlockedCoreProblemIds.has(coreProblem.id)) {
            continue;
        }

        const validProblems = coreProblem.problems.filter((problem) =>
            problem.dependencyCoreProblemIds.every((depId) => unlockedCoreProblemIds.has(depId))
        );

        const totalProblems = validProblems.length;
        let answeredCount = 0;
        let correctCount = 0;

        for (const problem of validProblems) {
            const state = userProblemStateMap.get(problem.id);
            if (!state) continue;
            answeredCount += 1;
            if (state.isCleared) {
                correctCount += 1;
            }
        }

        const status = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);
        if (!status.isPassed) {
            continue;
        }

        let nextIndex = index + 1;
        const tempUnlocked = new Set(unlockedCoreProblemIds);
        while (nextIndex < subject.coreProblems.length) {
            const nextCoreProblem = subject.coreProblems[nextIndex];
            tempUnlocked.add(nextCoreProblem.id);
            unlockedCoreProblemIds.add(nextCoreProblem.id);

            const hasSolvable = nextCoreProblem.problems.some((problem) =>
                problem.dependencyCoreProblemIds.every((depId) => tempUnlocked.has(depId))
            );
            if (hasSolvable) break;
            nextIndex += 1;
        }
    }

    return unlockedCoreProblemIds;
}

async function main() {
    const shouldApply = process.argv.includes('--apply');
    const modeLabel = shouldApply ? 'APPLY' : 'DRY-RUN';

    const students = await prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, loginId: true },
        orderBy: { createdAt: 'asc' },
    });

    const subjectsRaw = await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        select: {
            id: true,
            name: true,
            coreProblems: {
                orderBy: [{ order: 'asc' }, { id: 'asc' }],
                select: {
                    id: true,
                    name: true,
                    order: true,
                    lectureVideos: true,
                    problems: {
                        select: {
                            id: true,
                            coreProblems: {
                                select: { id: true }
                            }
                        }
                    }
                }
            }
        }
    });

    const subjects: PreparedSubject[] = subjectsRaw.map((subject) => ({
        id: subject.id,
        name: subject.name,
        coreProblems: subject.coreProblems.map((coreProblem) => ({
            id: coreProblem.id,
            name: coreProblem.name,
            order: coreProblem.order,
            lectureVideos: coreProblem.lectureVideos,
            problems: coreProblem.problems.map((problem) => ({
                id: problem.id,
                dependencyCoreProblemIds: problem.coreProblems.map((cp) => cp.id),
            })),
        })),
    }));

    const allCoreProblemIds = subjects.flatMap((subject) => subject.coreProblems.map((cp) => cp.id));

    console.log(`対象生徒数: ${students.length}`);
    console.log(`対象教科数: ${subjects.length}`);
    console.log(`対象CoreProblem数: ${allCoreProblemIds.length}`);
    console.log(`モード: ${modeLabel}`);

    let totalCreateCandidates = 0;
    let totalUnlockCandidates = 0;
    let totalLockCandidates = 0;
    let totalLectureResetCandidates = 0;

    let totalCreated = 0;
    let totalUnlocked = 0;
    let totalLocked = 0;
    let totalLectureReset = 0;

    for (let idx = 0; idx < students.length; idx++) {
        const student = students[idx];

        const [userProblemStates, existingCoreStates] = await Promise.all([
            prisma.userProblemState.findMany({
                where: { userId: student.id },
                select: { problemId: true, isCleared: true },
            }),
            prisma.userCoreProblemState.findMany({
                where: {
                    userId: student.id,
                    coreProblemId: { in: allCoreProblemIds },
                },
                select: {
                    coreProblemId: true,
                    isUnlocked: true,
                }
            })
        ]);

        const userProblemStateMap = new Map(
            userProblemStates.map((state) => [state.problemId, { isCleared: state.isCleared }])
        );
        const existingCoreStateMap = new Map(
            existingCoreStates.map((state) => [state.coreProblemId, state])
        );

        const createData: Prisma.UserCoreProblemStateCreateManyInput[] = [];
        const unlockIds: string[] = [];
        const lockIds: string[] = [];
        const lockIdsWithLectureReset: string[] = [];

        for (const subject of subjects) {
            const unlockedCoreProblemIds = computeUnlockedCoreProblemIdsForSubject(subject, userProblemStateMap);
            const entryCoreProblemId = getEntryCoreProblemId(subject.coreProblems);

            for (const coreProblem of subject.coreProblems) {
                const shouldUnlock = unlockedCoreProblemIds.has(coreProblem.id);
                const existingState = existingCoreStateMap.get(coreProblem.id);
                const hasVideos = hasLectureVideos(coreProblem.lectureVideos);

                if (shouldUnlock) {
                    if (!existingState) {
                        createData.push({
                            userId: student.id,
                            coreProblemId: coreProblem.id,
                            priority: 0,
                            isUnlocked: true,
                            // 先頭単元は初期状態を維持し、動画視聴を必須にする。
                            isLectureWatched: coreProblem.id === entryCoreProblemId ? false : !hasVideos,
                            lectureWatchedAt: null,
                        });
                        continue;
                    }

                    if (!existingState.isUnlocked) {
                        unlockIds.push(coreProblem.id);
                    }
                    continue;
                }

                if (existingState?.isUnlocked) {
                    lockIds.push(coreProblem.id);
                    if (hasVideos) {
                        lockIdsWithLectureReset.push(coreProblem.id);
                    }
                }
            }
        }

        totalCreateCandidates += createData.length;
        totalUnlockCandidates += unlockIds.length;
        totalLockCandidates += lockIds.length;
        totalLectureResetCandidates += lockIdsWithLectureReset.length;

        if (shouldApply && (createData.length > 0 || unlockIds.length > 0 || lockIds.length > 0)) {
            const result = await prisma.$transaction(async (tx) => {
                let created = 0;
                let unlocked = 0;
                let locked = 0;
                let lectureReset = 0;

                if (createData.length > 0) {
                    const createdResult = await tx.userCoreProblemState.createMany({
                        data: createData,
                        skipDuplicates: true,
                    });
                    created = createdResult.count;
                }

                if (unlockIds.length > 0) {
                    const unlockedResult = await tx.userCoreProblemState.updateMany({
                        where: {
                            userId: student.id,
                            coreProblemId: { in: unlockIds },
                        },
                        data: {
                            isUnlocked: true,
                        },
                    });
                    unlocked = unlockedResult.count;
                }

                if (lockIds.length > 0) {
                    const lockedResult = await tx.userCoreProblemState.updateMany({
                        where: {
                            userId: student.id,
                            coreProblemId: { in: lockIds },
                        },
                        data: {
                            isUnlocked: false,
                        },
                    });
                    locked = lockedResult.count;
                }

                if (lockIdsWithLectureReset.length > 0) {
                    const resetResult = await tx.userCoreProblemState.updateMany({
                        where: {
                            userId: student.id,
                            coreProblemId: { in: lockIdsWithLectureReset },
                        },
                        data: {
                            isLectureWatched: false,
                            lectureWatchedAt: null,
                        },
                    });
                    lectureReset = resetResult.count;
                }

                return { created, unlocked, locked, lectureReset };
            });

            totalCreated += result.created;
            totalUnlocked += result.unlocked;
            totalLocked += result.locked;
            totalLectureReset += result.lectureReset;
        }

        if ((idx + 1) % 100 === 0 || idx === students.length - 1) {
            console.log(`進捗: ${idx + 1}/${students.length}`);
        }
    }

    console.log('--- 集計 ---');
    console.log(`Create候補: ${totalCreateCandidates}`);
    console.log(`Unlock候補: ${totalUnlockCandidates}`);
    console.log(`Lock候補: ${totalLockCandidates}`);
    console.log(`LectureReset候補: ${totalLectureResetCandidates}`);

    if (shouldApply) {
        console.log('--- 適用結果 ---');
        console.log(`作成件数: ${totalCreated}`);
        console.log(`Unlock更新件数: ${totalUnlocked}`);
        console.log(`Lock更新件数: ${totalLocked}`);
        console.log(`LectureReset更新件数: ${totalLectureReset}`);
    } else {
        console.log('DRY-RUNのためDB更新は実行していません。');
        console.log('適用する場合は --apply を指定してください。');
    }
}

main()
    .catch((error) => {
        console.error('再計算処理に失敗しました:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
