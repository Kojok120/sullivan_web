import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { calculateCoreProblemStatus } from '@/lib/progression';
import { emitRealtimeEvent } from '@/lib/realtime-events';
import { decodeUnitToken, type QRData } from '@/lib/qr-utils';
import {
    buildProgressionUpdateScope,
    filterCoreProblemIdsByScope,
    filterCoreProblemsByScope,
} from '@/lib/grading-progression-scope';

import { calculateNewPriority } from './priority';
import type { GradingBatchSummary, GradingResult } from './types';

export async function recordGradingResults(results: GradingResult[], qrData: QRData): Promise<GradingBatchSummary | null> {
    if (results.length === 0) return null;

    const userId = results[0].studentId;
    const problemIds = results.map((result) => result.problemId);
    const sessionIsPerfect = results.every((result) => result.isCorrect);

    const groupId = crypto.randomUUID();

    const involvedCpIds = await prisma.$transaction(async (tx) => {
        await tx.learningHistory.createMany({
            data: results.map((result) => ({
                userId,
                problemId: result.problemId,
                evaluation: result.evaluation,
                userAnswer: result.userAnswer || '',
                feedback: result.feedback || '',
                answeredAt: new Date(),
                groupId,
                isVideoWatched: false,
            })),
        });

        const currentStates = await tx.userProblemState.findMany({
            where: { userId, problemId: { in: problemIds } },
        });
        const stateMap = new Map(currentStates.map((state) => [state.problemId, state]));

        const newStates: Prisma.UserProblemStateCreateManyInput[] = [];
        const updatePromises: Prisma.PrismaPromise<unknown>[] = [];

        for (const result of results) {
            const currentState = stateMap.get(result.problemId);

            if (!currentState) {
                const newPriority = calculateNewPriority(0, result.evaluation);
                newStates.push({
                    userId,
                    problemId: result.problemId,
                    isCleared: result.isCorrect,
                    lastAnsweredAt: new Date(),
                    priority: newPriority,
                });
                continue;
            }

            const currentPriority = currentState.priority || 0;
            const newPriority = calculateNewPriority(currentPriority, result.evaluation);
            updatePromises.push(
                tx.userProblemState.update({
                    where: { userId_problemId: { userId, problemId: result.problemId } },
                    data: {
                        isCleared: result.isCorrect,
                        lastAnsweredAt: new Date(),
                        priority: newPriority,
                    },
                }),
            );
        }

        if (newStates.length > 0) {
            await tx.userProblemState.createMany({ data: newStates });
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }

        const problems = await tx.problem.findMany({
            where: { id: { in: problemIds } },
            include: { coreProblems: true },
        });
        const problemMap = new Map(problems.map((problem) => [problem.id, problem]));
        const allCoreProblemIdsInBatch = Array.from(
            new Set(problems.flatMap((problem) => problem.coreProblems.map((coreProblem) => coreProblem.id))),
        );

        let progressionScope: Set<string> | null = null;
        const decodedUnitMasterNumber = qrData.u ? decodeUnitToken(qrData.u) : null;
        if (qrData.u && decodedUnitMasterNumber !== null) {
            const subjectIds = new Set(problems.map((problem) => problem.subjectId));
            if (subjectIds.size === 1) {
                const [subjectId] = Array.from(subjectIds);
                const targetCoreProblem = await tx.coreProblem.findFirst({
                    where: {
                        subjectId,
                        masterNumber: decodedUnitMasterNumber,
                    },
                    select: { id: true, name: true },
                });

                if (!targetCoreProblem) {
                    console.warn(
                        `[ProgressionScope] Unit token "${qrData.u}" was ignored because target CoreProblem was not found.`,
                    );
                } else {
                    const unlockedStates = await tx.userCoreProblemState.findMany({
                        where: {
                            userId,
                            coreProblemId: { in: allCoreProblemIdsInBatch },
                            isUnlocked: true,
                        },
                        select: { coreProblemId: true },
                    });

                    progressionScope = buildProgressionUpdateScope(
                        unlockedStates.map((state) => state.coreProblemId),
                        targetCoreProblem.id,
                    );
                    console.log(
                        `[ProgressionScope] Unit mode enabled: target=${targetCoreProblem.name}, scopeSize=${progressionScope?.size ?? 0}`,
                    );
                }
            } else {
                console.warn(
                    `[ProgressionScope] Unit token "${qrData.u}" was ignored because graded problems span multiple subjects.`,
                );
            }
        } else if (qrData.u) {
            console.warn(`[ProgressionScope] Invalid unit token "${qrData.u}". Fallback to normal progression mode.`);
        }

        const cpDeltas = new Map<string, number>();
        const involvedCpIdsInTransaction = new Set<string>();

        for (const result of results) {
            const problem = problemMap.get(result.problemId);
            if (!problem) continue;

            const targetCoreProblems = filterCoreProblemsByScope(problem.coreProblems, progressionScope);

            if (result.isCorrect) {
                for (const coreProblem of targetCoreProblems) {
                    const current = cpDeltas.get(coreProblem.id) || 0;
                    cpDeltas.set(coreProblem.id, current - 5);
                    involvedCpIdsInTransaction.add(coreProblem.id);
                }
                continue;
            }

            if (!result.badCoreProblemIds || result.badCoreProblemIds.length === 0) {
                continue;
            }

            const coreProblemIdsOnProblem = new Set(targetCoreProblems.map((coreProblem) => coreProblem.id));
            const scopedBadCoreProblemIds = filterCoreProblemIdsByScope(result.badCoreProblemIds, progressionScope);
            for (const coreProblemId of scopedBadCoreProblemIds) {
                if (!coreProblemIdsOnProblem.has(coreProblemId)) continue;
                const current = cpDeltas.get(coreProblemId) || 0;
                cpDeltas.set(coreProblemId, current + 5);
                involvedCpIdsInTransaction.add(coreProblemId);
            }
        }

        await Promise.all(
            Array.from(cpDeltas.entries()).map(([coreProblemId, delta]) =>
                tx.userCoreProblemState.upsert({
                    where: { userId_coreProblemId: { userId, coreProblemId } },
                    create: {
                        userId,
                        coreProblemId,
                        priority: delta,
                        isUnlocked: false,
                        isLectureWatched: false,
                        lectureWatchedAt: null,
                    },
                    update: { priority: { increment: delta } },
                }),
            ),
        );

        return involvedCpIdsInTransaction;
    });

    await checkProgressAndUnlock(userId, Array.from(involvedCpIds));

    try {
        await emitRealtimeEvent({
            userId,
            type: 'grading_completed',
            payload: {
                groupId,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[Realtime] Failed to emit grading_completed event:', error);
    }
    console.log(`Emitted GRADING_COMPLETED event for user ${userId}, group ${groupId}`);

    return { groupId, sessionIsPerfect };
}

export async function checkProgressAndUnlock(userId: string, cpIdsToCheck: string[]) {
    if (cpIdsToCheck.length === 0) return;

    const cpDetails = await prisma.coreProblem.findMany({
        where: { id: { in: cpIdsToCheck } },
        include: {
            problems: {
                include: { coreProblems: { select: { id: true } } },
            },
            subject: {
                select: {
                    id: true,
                    coreProblems: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            name: true,
                            order: true,
                            lectureVideos: true,
                        },
                    },
                },
            },
        },
    });

    if (cpDetails.length === 0) return;

    const subjectIds = Array.from(new Set(cpDetails.map((coreProblem) => coreProblem.subject.id)));
    const coreProblemsInSubjects = await prisma.coreProblem.findMany({
        where: { subjectId: { in: subjectIds } },
        select: {
            id: true,
            problems: {
                select: {
                    coreProblems: {
                        select: { id: true },
                    },
                },
            },
        },
    });

    const solvableDependencyMap = new Map<string, string[][]>();
    for (const coreProblem of coreProblemsInSubjects) {
        solvableDependencyMap.set(
            coreProblem.id,
            coreProblem.problems.map((problem) => problem.coreProblems.map((dep) => dep.id)),
        );
    }

    const allProblemIds = new Set<string>();
    cpDetails.forEach((coreProblem) => coreProblem.problems.forEach((problem) => allProblemIds.add(problem.id)));

    const allUserProblemStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: Array.from(allProblemIds) },
        },
    });
    const userProblemStateMap = new Map(allUserProblemStates.map((state) => [state.problemId, state]));

    const allCpIdsInSubjects = new Set<string>();
    cpDetails.forEach((coreProblem) => coreProblem.subject.coreProblems.forEach((subjectCp) => allCpIdsInSubjects.add(subjectCp.id)));

    const allUnlockedCpStates = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            coreProblemId: { in: Array.from(allCpIdsInSubjects) },
            isUnlocked: true,
        },
        select: { coreProblemId: true },
    });
    const unlockedCpIds = new Set(allUnlockedCpStates.map((state) => state.coreProblemId));

    const firstCpIds = new Set<string>();
    cpDetails.forEach((coreProblem) => {
        if (coreProblem.subject && coreProblem.subject.coreProblems && coreProblem.subject.coreProblems.length > 0) {
            firstCpIds.add(coreProblem.subject.coreProblems[0].id);
        }
    });
    firstCpIds.forEach((id) => unlockedCpIds.add(id));

    for (const coreProblem of cpDetails) {
        const validProblems = coreProblem.problems.filter((problem) => {
            return problem.coreProblems.every((relatedCp) => unlockedCpIds.has(relatedCp.id));
        });

        const totalProblems = validProblems.length;
        const validProblemIds = new Set(validProblems.map((problem) => problem.id));

        const userStatesForCp = Array.from(validProblemIds)
            .map((problemId) => userProblemStateMap.get(problemId))
            .filter((state): state is NonNullable<typeof state> => state !== undefined);

        const answeredCount = userStatesForCp.length;
        const correctCount = userStatesForCp.filter((state) => state.isCleared).length;

        console.log(`Checking CP ${coreProblem.name}: Valid/Total=${validProblems.length}/${coreProblem.problems.length}, Answered=${answeredCount}`);

        const status = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);
        console.log(`  -> Status: isPassed=${status.isPassed}, AR=${status.answerRate}, CR=${status.correctRate}`);
        console.log(`  -> Counts: Total=${totalProblems}, Ans=${answeredCount}, Corr=${correctCount}`);

        if (status.isPassed) {
            const subjectCps = coreProblem.subject.coreProblems;
            const currentIndex = subjectCps.findIndex((subjectCp) => subjectCp.id === coreProblem.id);
            console.log(`  -> Index: ${currentIndex} / ${subjectCps.length}`);

            if (currentIndex !== -1 && currentIndex < subjectCps.length - 1) {
                let nextIndex = currentIndex + 1;
                const tempUnlockedCpIds = new Set(unlockedCpIds);

                while (nextIndex < subjectCps.length) {
                    const nextCp = subjectCps[nextIndex];
                    const hasLectureVideos = Array.isArray(nextCp.lectureVideos) && nextCp.lectureVideos.length > 0;

                    await prisma.userCoreProblemState.upsert({
                        where: {
                            userId_coreProblemId: {
                                userId,
                                coreProblemId: nextCp.id,
                            },
                        },
                        create: {
                            userId,
                            coreProblemId: nextCp.id,
                            isUnlocked: true,
                            priority: 0,
                            isLectureWatched: !hasLectureVideos,
                        },
                        update: {
                            isUnlocked: true,
                        },
                    });
                    console.log(`Unlocked CoreProblem ${nextCp.name} (recursive).`);

                    tempUnlockedCpIds.add(nextCp.id);
                    unlockedCpIds.add(nextCp.id);

                    console.log(`  -> LectureVideos found: ${nextCp.lectureVideos ? 'YES' : 'NO'}`);

                    try {
                        await emitRealtimeEvent({
                            userId,
                            type: 'core_problem_unlocked',
                            payload: {
                                coreProblemId: nextCp.id,
                                coreProblemName: nextCp.name,
                                lectureVideos: nextCp.lectureVideos || null,
                            },
                        });
                        console.log(`Emitted core_problem_unlocked event for user ${userId}, CP ${nextCp.name}`);
                    } catch (error) {
                        console.error('[Realtime] Failed to emit core_problem_unlocked event:', error);
                    }

                    const problemDependencyList = solvableDependencyMap.get(nextCp.id);
                    const hasSolvable = !!problemDependencyList?.some((depIds) =>
                        depIds.every((depId) => tempUnlockedCpIds.has(depId)),
                    );

                    if (hasSolvable) {
                        console.log(`  -> CP ${nextCp.name} has solvable problems. Stopping recursion.`);
                        break;
                    }

                    console.log(`  -> CP ${nextCp.name} has no solvable problems yet. Continuing to next CP...`);
                    nextIndex++;
                }
            } else {
                console.log('  -> No next CP found (or is last).');
            }
        }
    }
}
