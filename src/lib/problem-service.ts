/**
 * Problem CRUD 共通サービス
 * 問題管理とカリキュラム管理で共通のロジックを提供
 */

import { prisma } from '@/lib/prisma';
import { getNextCustomId, getNextCustomIds } from '@/lib/curriculum-service';
import { resolveVideoStatusFromUrl, type VideoStatusValue } from '@/lib/problem-ui';
import { buildStructuredDocumentFromText } from '@/lib/structured-problem';
import type { Prisma } from '@prisma/client';

type ProblemServiceClient = Pick<
    typeof prisma,
    | 'coreProblem'
    | 'problem'
    | 'problemRevision'
    | 'learningHistory'
    | 'userProblemState'
    | 'subject'
    | '$queryRaw'
>;

type ProblemServiceClientWithTransaction = ProblemServiceClient & Partial<Pick<typeof prisma, '$transaction'>>;

type ProblemRevisionWriteInput = {
    structuredContent: Prisma.InputJsonValue;
    correctAnswer: string | null;
    acceptedAnswers: string[];
};

/**
 * 既存 Problem に新規 PUBLISHED ProblemRevision を作るときは、
 * (problemId, revisionNumber) の UNIQUE 制約と衝突しないよう
 * `max(revisionNumber) + 1` を採番する。リビジョンが無い問題には 1 を返す。
 */
async function getNextRevisionNumber(
    tx: ProblemServiceClient,
    problemId: string,
): Promise<number> {
    const latest = await tx.problemRevision.findFirst({
        where: { problemId },
        orderBy: { revisionNumber: 'desc' },
        select: { revisionNumber: true },
    });
    return (latest?.revisionNumber ?? 0) + 1;
}

/**
 * createProblemCore / bulk 系で作成する PUBLISHED ProblemRevision の入力データ。
 * 旧 Problem.question / answer / acceptedAnswers と等価な内容を構造化ソースとして残す。
 */
function buildPublishedRevisionData(input: {
    question: string;
    answer?: string | null;
    acceptedAnswers?: string[];
    revisionNumber: number;
}): Omit<Prisma.ProblemRevisionUncheckedCreateInput, 'problemId'> {
    return {
        revisionNumber: input.revisionNumber,
        status: 'PUBLISHED',
        ...buildRevisionWriteInput(input),
        publishedAt: new Date(),
    };
}

function buildRevisionWriteInput(input: {
    question: string;
    answer?: string | null;
    acceptedAnswers?: string[];
}): ProblemRevisionWriteInput {
    return {
        structuredContent: buildStructuredDocumentFromText(input.question) as unknown as Prisma.InputJsonValue,
        correctAnswer: input.answer?.trim() ? input.answer : null,
        acceptedAnswers: input.acceptedAnswers ?? [],
    };
}

type NormalizedProblemData = Omit<CreateProblemData, 'subjectId'> & {
    subjectId: string;
};

async function runBatchTransaction(
    client: ProblemServiceClientWithTransaction,
    operations: Prisma.PrismaPromise<unknown>[]
): Promise<unknown[]> {
    if (typeof client.$transaction === 'function') {
        return client.$transaction(operations);
    }
    return Promise.all(operations);
}

function makeSubjectMasterKey(subjectId: string, masterNumber: number): string {
    return `${subjectId}:${masterNumber}`;
}

function getProblemLabel(problem: Pick<CreateProblemData, 'question' | 'masterNumber'>): string {
    const masterNumberLabel = typeof problem.masterNumber === 'number'
        ? String(problem.masterNumber)
        : '未設定';
    const question = problem.question.trim() || '(問題文なし)';
    return `【マスタNo: ${masterNumberLabel}】問題文: ${question}`;
}

function formatProblemServiceError(error: unknown): string {
    console.error('[problem-service] バッチ処理中に内部エラーが発生しました', error);
    return '内部エラーが発生しました';
}

export interface CreateProblemData {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    videoStatus?: VideoStatusValue;
    coreProblemIds: string[];
    order?: number;
    subjectId?: string;
    masterNumber?: number;
}

export type BulkCreateOptions = {
    subjectId?: string;
    assignOrder?: boolean;
    batchSize?: number;
};

/**
 * CoreProblem情報を一括取得
 * @param coreProblemIds CoreProblem IDの配列
 * @param tx Prismaトランザクション（オプション）
 */
async function fetchCoreProblemMap(
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
 * CoreProblem配列から単一教科を解決する
 */
async function resolveSubjectIdFromCoreProblems(
    coreProblemIds: string[],
    tx: ProblemServiceClient = prisma
): Promise<string | undefined> {
    if (coreProblemIds.length === 0) {
        return undefined;
    }

    const uniqueCoreProblemIds = Array.from(new Set(coreProblemIds));
    const coreProblemMap = await fetchCoreProblemMap(uniqueCoreProblemIds, tx);
    if (coreProblemMap.size !== uniqueCoreProblemIds.length) {
        throw new Error('存在しないCoreProblemが含まれています');
    }

    const subjectIds = new Set(Array.from(coreProblemMap.values()).map((cp) => cp.subjectId));
    if (subjectIds.size > 1) {
        throw new Error('CoreProblemは同一教科のみ指定できます');
    }

    return Array.from(subjectIds)[0];
}

/**
 * CoreProblem / 明示subjectId から安全に subjectId を解決する
 */
async function resolveSubjectId(
    data: { subjectId?: string; coreProblemIds: string[] },
    tx: ProblemServiceClient = prisma
): Promise<string | undefined> {
    const subjectIdFromCoreProblems = await resolveSubjectIdFromCoreProblems(data.coreProblemIds, tx);

    if (data.subjectId && subjectIdFromCoreProblems && data.subjectId !== subjectIdFromCoreProblems) {
        throw new Error('指定されたsubjectIdとCoreProblemの教科が一致しません');
    }

    return data.subjectId || subjectIdFromCoreProblems;
}

/**
 * 問題作成の共通ロジック
 *
 * Problem 行と PUBLISHED ProblemRevision を 1 トランザクションで作成し、
 * Problem.publishedRevisionId をリビジョンに紐付けて返す。Phase C で legacy カラム
 * (question / answer / acceptedAnswers) は drop 予定だが、ロールバック安全性のため
 * 削除 migration 前は Problem 側にも値を書き込む。
 */
export async function createProblemCore(
    data: CreateProblemData,
) {
    if (data.coreProblemIds.length === 0) {
        throw new Error('CoreProblemは必須です');
    }

    const subjectId = await resolveSubjectId(data, prisma);
    if (!subjectId) {
        throw new Error('教科を特定できませんでした');
    }

    const customId = await getNextCustomId(subjectId, prisma);

    let order = data.order;
    if (order === undefined) {
        const lastProblem = await prisma.problem.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true }
        });
        order = (lastProblem?.order ?? 0) + 1;
    }

    const revisionData = buildPublishedRevisionData({ ...data, revisionNumber: 1 });

    return prisma.$transaction(async (tx) => {
        const problem = await tx.problem.create({
            data: {
                question: data.question,
                answer: data.answer,
                acceptedAnswers: data.acceptedAnswers || [],
                grade: data.grade,
                masterNumber: data.masterNumber,
                videoUrl: data.videoUrl,
                videoStatus: resolveVideoStatusFromUrl(data.videoStatus, data.videoUrl),
                customId,
                subjectId,
                order,
                coreProblems: {
                    connect: data.coreProblemIds.map(id => ({ id }))
                }
            }
        });

        const revision = await tx.problemRevision.create({
            data: {
                ...revisionData,
                problemId: problem.id,
            },
        });

        return tx.problem.update({
            where: { id: problem.id },
            data: { publishedRevisionId: revision.id },
        });
    });
}

/**
 * 問題削除の共通ロジック（関連データも削除）
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
 * 一括登録前にsubjectIdを解決し、不正データを除外する
 */
async function normalizeProblemsForBulk(
    problems: CreateProblemData[],
    options: BulkCreateOptions,
    client: ProblemServiceClient,
    warnings: string[]
): Promise<NormalizedProblemData[]> {
    const allCoreProblemIds = Array.from(new Set(problems.flatMap((problem) => problem.coreProblemIds)));
    const coreProblemMap = await fetchCoreProblemMap(allCoreProblemIds, client);

    const normalized: NormalizedProblemData[] = [];

    for (const problem of problems) {
        if (problem.coreProblemIds.length === 0) {
            warnings.push(`${getProblemLabel(problem)} はCoreProblem未設定のためスキップしました`);
            continue;
        }

        const targetCoreProblems = problem.coreProblemIds.map((id) => coreProblemMap.get(id)).filter(Boolean);
        if (targetCoreProblems.length !== problem.coreProblemIds.length) {
            warnings.push(`${getProblemLabel(problem)} は存在しないCoreProblemが含まれるためスキップしました`);
            continue;
        }

        const subjectIds = new Set(targetCoreProblems.map((coreProblem) => coreProblem!.subjectId));
        if (subjectIds.size > 1) {
            warnings.push(`${getProblemLabel(problem)} は複数教科のCoreProblemを含むためスキップしました`);
            continue;
        }

        const subjectIdFromCoreProblem = targetCoreProblems[0]?.subjectId;
        if (problem.subjectId && subjectIdFromCoreProblem && problem.subjectId !== subjectIdFromCoreProblem) {
            warnings.push(`${getProblemLabel(problem)} はsubjectIdとCoreProblemの教科が不一致のためスキップしました`);
            continue;
        }

        const subjectId = problem.subjectId || subjectIdFromCoreProblem || options.subjectId;
        if (!subjectId) {
            warnings.push(`${getProblemLabel(problem)} は教科を特定できないためスキップしました`);
            continue;
        }

        normalized.push({
            ...problem,
            subjectId,
        });
    }

    return normalized;
}

/**
 * 問題の一括作成（重複チェック・customId生成・順序付けを共通化）
 */
async function bulkCreateProblemsCore(
    problems: CreateProblemData[],
    options: BulkCreateOptions = {},
    client: ProblemServiceClientWithTransaction = prisma
): Promise<{ count: number; warnings: string[] }> {
    const warnings: string[] = [];

    if (problems.length === 0) {
        return { count: 0, warnings };
    }

    const normalizedProblems = await normalizeProblemsForBulk(problems, options, client, warnings);
    if (normalizedProblems.length === 0) {
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

    const subjectCounts = new Map<string, number>();
    for (const problem of normalizedProblems) {
        subjectCounts.set(problem.subjectId, (subjectCounts.get(problem.subjectId) || 0) + 1);
    }

    const customIdsBySubject = new Map<string, string[]>();
    const generatedCustomIds = await Promise.all(
        Array.from(subjectCounts.entries()).map(async ([subjectId, count]) => ({
            subjectId,
            ids: await getNextCustomIds(subjectId, count, client),
        }))
    );
    generatedCustomIds.forEach(({ subjectId, ids }) => {
        customIdsBySubject.set(subjectId, ids);
    });

    const subjectIndexes = new Map<string, number>();
    const batchSize = options.batchSize || normalizedProblems.length;
    let createdCount = 0;

    for (let i = 0; i < normalizedProblems.length; i += batchSize) {
        const batch = normalizedProblems.slice(i, i + batchSize);

        const preparedBatch = batch.map((problem) => {
            const ids = customIdsBySubject.get(problem.subjectId) || [];
            const idx = subjectIndexes.get(problem.subjectId) || 0;
            const customId = ids[idx];
            subjectIndexes.set(problem.subjectId, idx + 1);

            const order = assignOrder ? nextOrder++ : 0;
            return { problem, customId, order };
        });

        try {
            await createBatchWithRevisions(client, preparedBatch);
            createdCount += batch.length;
        } catch (error) {
            const errorMessage = formatProblemServiceError(error);
            warnings.push(`バッチ処理エラー (${i + 1}〜${Math.min(i + batchSize, normalizedProblems.length)}件目): ${errorMessage}`);
            warnings.push('エラーのため処理を中断しました。');
            break;
        }
    }

    return { count: createdCount, warnings };
}

/**
 * Problem + 初期 PUBLISHED ProblemRevision のペアを 1 トランザクション内で作成し、
 * publishedRevisionId を確定させる。バッチ単位で呼び出す前提。
 */
async function createBatchWithRevisions(
    client: ProblemServiceClientWithTransaction,
    items: Array<{ problem: NormalizedProblemData; customId: string; order: number }>,
): Promise<void> {
    if (items.length === 0) return;

    if (typeof client.$transaction !== 'function') {
        for (const { problem, customId, order } of items) {
            await createProblemWithRevisionUsing(client as ProblemServiceClient, problem, customId, order);
        }
        return;
    }

    await client.$transaction(async (tx) => {
        for (const { problem, customId, order } of items) {
            await createProblemWithRevisionUsing(tx as ProblemServiceClient, problem, customId, order);
        }
    });
}

async function createProblemWithRevisionUsing(
    tx: ProblemServiceClient,
    problem: NormalizedProblemData,
    customId: string,
    order: number,
): Promise<void> {
    const revisionData = buildPublishedRevisionData({ ...problem, revisionNumber: 1 });
    const created = await tx.problem.create({
        data: {
            question: problem.question,
            answer: problem.answer,
            acceptedAnswers: problem.acceptedAnswers || [],
            grade: problem.grade,
            masterNumber: problem.masterNumber,
            videoUrl: problem.videoUrl,
            videoStatus: resolveVideoStatusFromUrl(problem.videoStatus, problem.videoUrl),
            customId,
            subjectId: problem.subjectId,
            order,
            coreProblems: {
                connect: problem.coreProblemIds.map((id) => ({ id })),
            },
        },
    });
    const revision = await tx.problemRevision.create({
        data: { ...revisionData, problemId: created.id },
    });
    await tx.problem.update({
        where: { id: created.id },
        data: { publishedRevisionId: revision.id },
    });
}

/**
 * 問題の一括作成・更新 (Upsert)
 * subjectId + masterNumber が一致する既存問題があれば更新、なければ新規作成
 */
export async function bulkUpsertProblemsCore(
    problems: CreateProblemData[],
    options: BulkCreateOptions = {},
    client: ProblemServiceClientWithTransaction = prisma
): Promise<{ createdCount: number; updatedCount: number; warnings: string[] }> {
    const warnings: string[] = [];
    if (problems.length === 0) {
        return { createdCount: 0, updatedCount: 0, warnings };
    }

    const normalizedProblems = await normalizeProblemsForBulk(problems, options, client, warnings);
    if (normalizedProblems.length === 0) {
        return { createdCount: 0, updatedCount: 0, warnings };
    }

    const dedupedProblems: NormalizedProblemData[] = [];
    const seenMasterKeys = new Set<string>();
    for (const problem of normalizedProblems) {
        if (typeof problem.masterNumber === 'number') {
            const key = makeSubjectMasterKey(problem.subjectId, problem.masterNumber);
            if (seenMasterKeys.has(key)) {
                warnings.push(`${getProblemLabel(problem)} は同一TSV内で重複しているためスキップしました`);
                continue;
            }
            seenMasterKeys.add(key);
        }
        dedupedProblems.push(problem);
    }

    const lookupTargets = dedupedProblems
        .filter((problem) => typeof problem.masterNumber === 'number')
        .map((problem) => ({
            subjectId: problem.subjectId,
            masterNumber: problem.masterNumber as number,
        }));

    const existingProblemsMap = new Map<string, { id: string; publishedRevisionId: string | null }>();
    if (lookupTargets.length > 0) {
        const existing = await client.problem.findMany({
            where: {
                OR: lookupTargets.map((target) => ({
                    subjectId: target.subjectId,
                    masterNumber: target.masterNumber,
                }))
            },
            select: {
                id: true,
                subjectId: true,
                masterNumber: true,
                customId: true,
                publishedRevisionId: true,
            }
        });

        for (const problem of existing) {
            if (typeof problem.masterNumber !== 'number') {
                continue;
            }
            const key = makeSubjectMasterKey(problem.subjectId, problem.masterNumber);
            existingProblemsMap.set(key, {
                id: problem.id,
                publishedRevisionId: problem.publishedRevisionId,
            });
        }
    }

    const toCreate: CreateProblemData[] = [];
    const toUpdate: (NormalizedProblemData & { id: string; publishedRevisionId: string | null })[] = [];

    for (const problem of dedupedProblems) {
        if (typeof problem.masterNumber === 'number') {
            const key = makeSubjectMasterKey(problem.subjectId, problem.masterNumber);
            const existingProblem = existingProblemsMap.get(key);
            if (existingProblem) {
                toUpdate.push({
                    ...problem,
                    id: existingProblem.id,
                    publishedRevisionId: existingProblem.publishedRevisionId,
                });
                continue;
            }
        }

        toCreate.push(problem);
    }

    let createdCount = 0;
    if (toCreate.length > 0) {
        const createResult = await bulkCreateProblemsCore(toCreate, options, client);
        createdCount = createResult.count;
        warnings.push(...createResult.warnings);
    }

    let updatedCount = 0;
    if (toUpdate.length > 0) {
        const batchSize = options.batchSize || 50;
        for (let i = 0; i < toUpdate.length; i += batchSize) {
            const batch = toUpdate.slice(i, i + batchSize);
            try {
                await updateBatchWithRevisions(client, batch);
                updatedCount += batch.length;
            } catch (error) {
                const errorMessage = formatProblemServiceError(error);
                warnings.push(`更新バッチ処理エラー (${i + 1}〜${Math.min(i + batchSize, toUpdate.length)}件目): ${errorMessage}`);
            }
        }
    }

    return { createdCount, updatedCount, warnings };
}

/**
 * 既存 Problem の bulk 更新を 1 トランザクションで行う。
 * publishedRevision の structuredContent / correctAnswer / acceptedAnswers も同期更新し、
 * publishedRevision 未設定の Problem には PUBLISHED revision を新規作成して紐付ける。
 */
async function updateBatchWithRevisions(
    client: ProblemServiceClientWithTransaction,
    items: Array<NormalizedProblemData & { id: string; publishedRevisionId: string | null }>,
): Promise<void> {
    if (items.length === 0) return;

    if (typeof client.$transaction !== 'function') {
        for (const item of items) {
            await updateProblemWithRevisionUsing(client as ProblemServiceClient, item);
        }
        return;
    }

    await client.$transaction(async (tx) => {
        for (const item of items) {
            await updateProblemWithRevisionUsing(tx as ProblemServiceClient, item);
        }
    });
}

async function updateProblemWithRevisionUsing(
    tx: ProblemServiceClient,
    item: NormalizedProblemData & { id: string; publishedRevisionId: string | null },
): Promise<void> {
    await tx.problem.update({
        where: { id: item.id },
        data: {
            question: item.question,
            answer: item.answer,
            acceptedAnswers: item.acceptedAnswers || [],
            grade: item.grade,
            masterNumber: item.masterNumber,
            videoUrl: item.videoUrl,
            videoStatus: resolveVideoStatusFromUrl(item.videoStatus, item.videoUrl),
            subjectId: item.subjectId,
            coreProblems: {
                set: item.coreProblemIds.map((id) => ({ id })),
            },
        },
    });

    const revisionWrite = buildRevisionWriteInput(item);

    if (item.publishedRevisionId) {
        await tx.problemRevision.update({
            where: { id: item.publishedRevisionId },
            data: revisionWrite,
        });
        return;
    }

    // 既存 DRAFT リビジョンと revisionNumber が衝突しないよう次番を採番する
    const nextRevisionNumber = await getNextRevisionNumber(tx, item.id);
    const initialRevision = buildPublishedRevisionData({ ...item, revisionNumber: nextRevisionNumber });
    const revision = await tx.problemRevision.create({
        data: { ...initialRevision, problemId: item.id },
    });
    await tx.problem.update({
        where: { id: item.id },
        data: { publishedRevisionId: revision.id },
    });
}
