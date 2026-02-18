/**
 * Problem CRUD 共通サービス
 * 問題管理とカリキュラム管理で共通のロジックを提供
 */

import { prisma } from '@/lib/prisma';
import { getNextCustomId, getNextCustomIds } from '@/lib/curriculum-service';
import type { Prisma } from '@prisma/client';

type ProblemServiceClient = Pick<
    typeof prisma,
    'coreProblem' | 'problem' | 'learningHistory' | 'userProblemState' | 'subject' | '$queryRaw'
>;

type ProblemServiceClientWithTransaction = ProblemServiceClient & Partial<Pick<typeof prisma, '$transaction'>>;

async function runBatchTransaction(
    client: ProblemServiceClientWithTransaction,
    operations: Prisma.PrismaPromise<unknown>[]
): Promise<unknown[]> {
    if (typeof client.$transaction === 'function') {
        return client.$transaction(operations);
    }
    return Promise.all(operations);
}

export interface CreateProblemData {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[];
    order?: number;
    subjectId?: string; // customId生成に使用
    masterNumber?: number;
}

export type BulkCreateOptions = {
    subjectId?: string;
    assignOrder?: boolean;
    batchSize?: number;
};

/**
 * CoreProblem情報などからsubjectIdを解決する
 * 優先順位: 1. data.subjectId, 2. coreProblemIds[0]の所属Subject
 */
async function resolveSubjectId(
    data: { subjectId?: string; coreProblemIds: string[] },
    tx: ProblemServiceClient = prisma
): Promise<string | undefined> {
    if (data.subjectId) {
        return data.subjectId;
    }
    if (data.coreProblemIds.length > 0) {
        const firstCP = await tx.coreProblem.findUnique({
            where: { id: data.coreProblemIds[0] },
            select: { subjectId: true }
        });
        if (firstCP) {
            return firstCP.subjectId;
        }
    }
    return undefined;
}

/**
 * 問題作成の共通ロジック
 * @param data 問題データ
 * @param tx Prismaトランザクション（オプション）
 */
export async function createProblemCore(
    data: CreateProblemData,
    tx: ProblemServiceClient = prisma
) {
    // customId生成
    let customId: string | undefined;

    const subjectId = await resolveSubjectId(data, tx);

    if (subjectId) {
        customId = await getNextCustomId(subjectId, tx);
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
            masterNumber: data.masterNumber,
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
    tx: ProblemServiceClientWithTransaction = prisma
): Promise<number> {
    if (ids.length === 0) return 0;

    if (ids.length === 1) {
        const id = ids[0];
        const singleDeleteOperations = [
            tx.learningHistory.deleteMany({ where: { problemId: id } }),
            tx.userProblemState.deleteMany({ where: { problemId: id } }),
            tx.problem.delete({ where: { id } }),
        ];
        await runBatchTransaction(tx, singleDeleteOperations);
        return 1;
    }

    const [, , deleteResult] = await runBatchTransaction(tx, [
        tx.learningHistory.deleteMany({ where: { problemId: { in: ids } } }),
        tx.userProblemState.deleteMany({ where: { problemId: { in: ids } } }),
        tx.problem.deleteMany({ where: { id: { in: ids } } }),
    ]);

    const deleteBatchPayload = deleteResult as { count?: number };
    return deleteBatchPayload.count ?? ids.length;
}

/**
 * 問題の重複チェック
 * @param questions 問題文の配列
 * @param tx Prismaトランザクション（オプション）
 */
export async function checkDuplicateQuestions(
    questions: string[],
    tx: ProblemServiceClient = prisma
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
    tx: ProblemServiceClient = prisma
): Promise<Map<string, { id: string; subjectId: string; subject: { name: string } }>> {
    if (coreProblemIds.length === 0) {
        return new Map();
    }

    const coreProblems = await tx.coreProblem.findMany({
        where: { id: { in: coreProblemIds } },
        include: { subject: true }
    });

    return new Map(coreProblems.map((cp) => [cp.id, cp]));
}

/**
 * 問題の一括作成（重複チェック・customId生成・順序付けを共通化）
 */
export async function bulkCreateProblemsCore(
    problems: CreateProblemData[],
    options: BulkCreateOptions = {},
    client: ProblemServiceClientWithTransaction = prisma
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
    const subjectEntries = Array.from(subjectCounts.entries());
    const generatedCustomIds = await Promise.all(
        subjectEntries.map(async ([subjectId, count]) => ({
            subjectId,
            ids: await getNextCustomIds(subjectId, count, client),
        }))
    );
    generatedCustomIds.forEach(({ subjectId, ids }) => {
        customIdsBySubject.set(subjectId, ids);
    });

    const subjectIndexes = new Map<string, number>();
    const batchSize = options.batchSize || problemsWithSubject.length;
    let createdCount = 0;

    const totalProblems = problemsWithSubject.length;

    for (let i = 0; i < totalProblems; i += batchSize) {
        const batch = problemsWithSubject.slice(i, i + batchSize);

        try {
            const createOperations = batch.map(p => {
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

                return client.problem.create({
                    data: {
                        question: p.question,
                        answer: p.answer,
                        acceptedAnswers: p.acceptedAnswers || [],
                        grade: p.grade,
                        masterNumber: p.masterNumber,
                        videoUrl: p.videoUrl,
                        customId,
                        order,
                        coreProblems: {
                            connect: p.coreProblemIds.map(id => ({ id }))
                        }
                    }
                });
            });

            await runBatchTransaction(client, createOperations);
            createdCount += batch.length;
        } catch (error) {
            warnings.push(`バッチ処理エラー (${i + 1}〜${Math.min(i + batchSize, totalProblems)}件目): ${error}`);
            warnings.push('エラーのため処理を中断しました。');
            break;
        }
    }

    return { count: createdCount, warnings };
}

/**
 * 問題の一括作成・更新 (Upsert)
 * masterNumberが一致する既存問題があれば更新、なければ新規作成
 */
export async function bulkUpsertProblemsCore(
    problems: CreateProblemData[],
    options: BulkCreateOptions = {},
    client: ProblemServiceClientWithTransaction = prisma
): Promise<{ createdCount: number; updatedCount: number; warnings: string[] }> {
    const warnings: string[] = [];
    if (problems.length === 0) return { createdCount: 0, updatedCount: 0, warnings };

    // 1. Identify existing masterNumbers
    const inputMasterNumbers = problems
        .map(p => p.masterNumber)
        .filter((n): n is number => n !== undefined && n !== null);

    const existingProblemsMap = new Map<number, string>(); // masterNumber -> problemId

    if (inputMasterNumbers.length > 0) {
        const existing = await client.problem.findMany({
            where: { masterNumber: { in: inputMasterNumbers } },
            select: { id: true, masterNumber: true }
        });
        existing.forEach((p) => {
            if (typeof p.masterNumber === 'number') {
                existingProblemsMap.set(p.masterNumber, p.id);
            }
        });
    }

    const toCreate: CreateProblemData[] = [];
    const toUpdate: (CreateProblemData & { id: string })[] = [];

    for (const p of problems) {
        if (p.masterNumber && existingProblemsMap.has(p.masterNumber)) {
            toUpdate.push({ ...p, id: existingProblemsMap.get(p.masterNumber)! });
        } else {
            toCreate.push(p);
        }
    }

    // 2. Handle Creations
    let createdCount = 0;
    if (toCreate.length > 0) {
        const createResult = await bulkCreateProblemsCore(toCreate, options, client);
        createdCount = createResult.count;
        warnings.push(...createResult.warnings);
    }

    // 3. Handle Updates
    let updatedCount = 0;
    if (toUpdate.length > 0) {
        const batchSize = options.batchSize || 50;
        for (let i = 0; i < toUpdate.length; i += batchSize) {
            const batch = toUpdate.slice(i, i + batchSize);
            try {
                const updateOperations = batch.map(p => {
                    return client.problem.update({
                        where: { id: p.id },
                        data: {
                            question: p.question,
                            answer: p.answer,
                            acceptedAnswers: p.acceptedAnswers || [],
                            grade: p.grade,
                            videoUrl: p.videoUrl,
                            coreProblems: {
                                set: p.coreProblemIds.map(id => ({ id }))
                            }
                        }
                    });
                });

                await runBatchTransaction(client, updateOperations);
                updatedCount += batch.length;
            } catch (error) {
                warnings.push(`更新バッチ処理エラー (${i + 1}〜${Math.min(i + batchSize, toUpdate.length)}件目): ${error}`);
            }
        }
    }

    return { createdCount, updatedCount, warnings };
}
