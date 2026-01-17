/**
 * Problem CRUD 共通サービス
 * 問題管理とカリキュラム管理で共通のロジックを提供
 */

import { prisma } from '@/lib/prisma';
import { getNextCustomId, getNextCustomIds } from '@/lib/curriculum-service';

export interface CreateProblemData {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[];
    order?: number;
    subjectId?: string; // customId生成に使用
}

export type BulkCreateOptions = {
    subjectId?: string;
    assignOrder?: boolean;
    batchSize?: number;
};

/**
 * 問題作成の共通ロジック
 * @param data 問題データ
 * @param tx Prismaトランザクション（オプション）
 */
export async function createProblemCore(
    data: CreateProblemData,
    tx: any = prisma
) {
    // customId生成
    let customId: string | undefined;

    // subjectIdが明示的に指定されている場合はそれを使用
    if (data.subjectId) {
        customId = await getNextCustomId(data.subjectId, tx);
    }
    // そうでなければ、最初のCoreProblemからsubjectIdを取得
    else if (data.coreProblemIds.length > 0) {
        const firstCP = await tx.coreProblem.findUnique({
            where: { id: data.coreProblemIds[0] },
            include: { subject: true }
        });
        if (firstCP) {
            customId = await getNextCustomId(firstCP.subjectId, tx);
        }
    }

    // order取得（指定がない場合は自動採番）
    let order = data.order;
    if (order === undefined) {
        const lastProblem = await tx.problem.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true }
        });
        order = (lastProblem?.order ?? 0) + 1;
    }

    return tx.problem.create({
        data: {
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers || [],
            grade: data.grade,
            videoUrl: data.videoUrl,
            customId,
            order,
            coreProblems: {
                connect: data.coreProblemIds.map(id => ({ id }))
            }
        }
    });
}

/**
 * 問題削除の共通ロジック（関連データも削除）
 * @param ids 削除対象のProblem ID
 * @param tx Prismaトランザクション（オプション）
 */
export async function deleteProblemsWithRelations(
    ids: string[],
    tx: any = prisma
): Promise<number> {
    if (ids.length === 0) return 0;

    if (ids.length === 1) {
        const id = ids[0];
        await tx.$transaction([
            tx.learningHistory.deleteMany({ where: { problemId: id } }),
            tx.userProblemState.deleteMany({ where: { problemId: id } }),
            tx.problem.delete({ where: { id } }),
        ]);
        return 1;
    }

    const [, , deleteResult] = await tx.$transaction([
        tx.learningHistory.deleteMany({ where: { problemId: { in: ids } } }),
        tx.userProblemState.deleteMany({ where: { problemId: { in: ids } } }),
        tx.problem.deleteMany({ where: { id: { in: ids } } }),
    ]);

    return deleteResult.count ?? ids.length;
}

/**
 * 問題の重複チェック
 * @param questions 問題文の配列
 * @param tx Prismaトランザクション（オプション）
 */
export async function checkDuplicateQuestions(
    questions: string[],
    tx: any = prisma
): Promise<Set<string>> {
    const existingProblems = await tx.problem.findMany({
        where: { question: { in: questions } },
        select: { question: true }
    });
    return new Set(existingProblems.map((p: { question: string }) => p.question));
}

/**
 * CoreProblem情報を一括取得
 * @param coreProblemIds CoreProblem IDの配列
 * @param tx Prismaトランザクション（オプション）
 */
export async function fetchCoreProblemMap(
    coreProblemIds: string[],
    tx: any = prisma
): Promise<Map<string, { id: string; subjectId: string; subject: { name: string } }>> {
    if (coreProblemIds.length === 0) {
        return new Map();
    }

    const coreProblems = await tx.coreProblem.findMany({
        where: { id: { in: coreProblemIds } },
        include: { subject: true }
    });

    return new Map(coreProblems.map((cp: any) => [cp.id, cp]));
}

/**
 * 問題の一括作成（重複チェック・customId生成・順序付けを共通化）
 */
export async function bulkCreateProblemsCore(
    problems: CreateProblemData[],
    options: BulkCreateOptions = {},
    client: any = prisma
): Promise<{ count: number; warnings: string[] }> {
    const warnings: string[] = [];

    if (problems.length === 0) {
        return { count: 0, warnings };
    }

    const duplicateQuestions = await checkDuplicateQuestions(
        problems.map(p => p.question),
        client
    );

    const problemsToCreate = problems.filter(p => {
        if (duplicateQuestions.has(p.question)) {
            warnings.push(`問題「${p.question.substring(0, 20)}...」は既に存在するためスキップしました`);
            return false;
        }
        return true;
    });

    if (problemsToCreate.length === 0) {
        return { count: 0, warnings };
    }

    const assignOrder = options.assignOrder ?? false;
    let nextOrder = 0;
    if (assignOrder) {
        const lastProblem = await client.problem.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true }
        });
        nextOrder = (lastProblem?.order ?? 0) + 1;
    }

    let coreProblemMap = new Map<string, { subjectId: string }>();
    if (!options.subjectId) {
        const allCoreProblemIds = Array.from(
            new Set(problemsToCreate.flatMap(p => p.coreProblemIds))
        );
        const map = await fetchCoreProblemMap(allCoreProblemIds, client);
        coreProblemMap = new Map(
            Array.from(map.entries()).map(([id, cp]) => [id, { subjectId: cp.subjectId }])
        );
    }

    const problemsWithSubject = problemsToCreate.map(p => {
        const subjectId = p.subjectId
            || options.subjectId
            || (p.coreProblemIds[0] ? coreProblemMap.get(p.coreProblemIds[0])?.subjectId : undefined);
        return { ...p, subjectId };
    });

    const subjectCounts = new Map<string, number>();
    for (const p of problemsWithSubject) {
        if (p.subjectId) {
            subjectCounts.set(p.subjectId, (subjectCounts.get(p.subjectId) || 0) + 1);
        }
    }

    const customIdsBySubject = new Map<string, string[]>();
    for (const [subjectId, count] of subjectCounts) {
        const ids = await getNextCustomIds(subjectId, count, client);
        customIdsBySubject.set(subjectId, ids);
    }

    const subjectIndexes = new Map<string, number>();
    const batchSize = options.batchSize || problemsWithSubject.length;
    let createdCount = 0;

    const totalProblems = problemsWithSubject.length;

    for (let i = 0; i < totalProblems; i += batchSize) {
        const batch = problemsWithSubject.slice(i, i + batchSize);

        try {
            await client.$transaction(async (tx: any) => {
                const createPromises = batch.map(p => {
                    let customId: string | undefined;

                    if (p.subjectId) {
                        const ids = customIdsBySubject.get(p.subjectId);
                        const idx = subjectIndexes.get(p.subjectId) || 0;
                        if (ids && ids[idx]) {
                            customId = ids[idx];
                            subjectIndexes.set(p.subjectId, idx + 1);
                        }
                    }

                    const order = assignOrder ? nextOrder++ : 0;

                    return tx.problem.create({
                        data: {
                            question: p.question,
                            answer: p.answer,
                            acceptedAnswers: p.acceptedAnswers || [],
                            grade: p.grade,
                            videoUrl: p.videoUrl,
                            customId,
                            order,
                            coreProblems: {
                                connect: p.coreProblemIds.map(id => ({ id }))
                            }
                        }
                    });
                });

                await Promise.all(createPromises);
                createdCount += batch.length;
            }, {
                maxWait: 10000,
                timeout: 20000
            });
        } catch (error) {
            warnings.push(`バッチ処理エラー (${i + 1}〜${Math.min(i + batchSize, totalProblems)}件目): ${error}`);
            warnings.push('エラーのため処理を中断しました。');
            break;
        }
    }

    return { count: createdCount, warnings };
}
