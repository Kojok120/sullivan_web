'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, ProblemAuthoringTool, VideoStatus } from '@prisma/client';

import { requireAdmin, requireProblemAuthor } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNextCustomId } from '@/lib/curriculum-service';
import { deleteProblemsWithRelations, bulkUpsertProblemsCore, createProblemCore } from '@/lib/problem-service';
import {
    isProblemStatusValue,
    isVideoStatusValue,
    resolveVideoStatusFromUrl,
    type ProblemStatusValue,
    type VideoStatusValue,
} from '@/lib/problem-ui';
import {
    deriveLegacyFieldsFromStructuredData,
    normalizeAnswerForAuthoring,
    normalizeAnswerSpecForAuthoring,
    parseAnswerSpec,
    parsePrintConfig,
    parseStructuredDocument,
} from '@/lib/structured-problem';
import { createProblemAssetSignedUrl, removeProblemAssetFromStorage, uploadProblemAssetToStorage } from '@/lib/problem-assets';
import { SENT_BACK_REASON_MAX } from './constants';
import { problemAdminInclude } from './types';

type ProblemFilters = {
    grade?: string;
    subjectId?: string;
    coreProblemId?: string;
    videoStatus?: VideoStatusValue;
    problemType?: string;
    status?: string;
};

type FilterCondition =
    | { type: 'grade'; value: string }
    | { type: 'subjectId'; value: string }
    | { type: 'coreProblemId'; value: string }
    | { type: 'search'; value: string }
    | { type: 'videoStatus'; value: VideoStatusValue }
    | { type: 'problemType'; value: string }
    | { type: 'status'; value: string };

const SEARCH_SCALAR_FIELDS = ['question', 'answer', 'customId'] as const;

function buildExactMatchSearchOR(searchTerm: string): Prisma.ProblemWhereInput[] {
    // customId の大文字小文字を区別しない完全一致 (例: "E-355" や "e-355" を直接入力したケース)
    const conditions: Prisma.ProblemWhereInput[] = [
        { customId: { equals: searchTerm, mode: 'insensitive' } },
    ];

    if (/^\d+$/.test(searchTerm)) {
        // 数字だけ入力されたケース ("355") は customId が "-355" で終わるものを完全一致候補に含める
        // ※ "E-3355" の suffix は "-3355" なので "-355" には一致しない
        conditions.push({ customId: { endsWith: `-${searchTerm}` } });

        const masterNumber = Number.parseInt(searchTerm, 10);
        if (Number.isSafeInteger(masterNumber)) {
            conditions.push({ masterNumber });
        }
    }

    return conditions;
}

function revalidateProblemPaths(problemId?: string) {
    revalidatePath('/admin/problems');
    revalidatePath('/materials/problems');

    if (problemId) {
        revalidatePath(`/admin/problems/${problemId}`);
        revalidatePath(`/materials/problems/${problemId}`);
    }
}

function buildFilterConditions(filters: ProblemFilters, search?: string): FilterCondition[] {
    const conditions: FilterCondition[] = [];

    if (filters.grade) conditions.push({ type: 'grade', value: filters.grade });
    if (filters.subjectId) conditions.push({ type: 'subjectId', value: filters.subjectId });
    if (filters.coreProblemId) conditions.push({ type: 'coreProblemId', value: filters.coreProblemId });
    if (filters.videoStatus) conditions.push({ type: 'videoStatus', value: filters.videoStatus });
    if (filters.problemType) conditions.push({ type: 'problemType', value: filters.problemType });
    if (filters.status) conditions.push({ type: 'status', value: filters.status });
    if (search) conditions.push({ type: 'search', value: search });

    return conditions;
}

function conditionsToPrismaWhere(conditions: FilterCondition[]): Prisma.ProblemWhereInput {
    const where: Prisma.ProblemWhereInput = {};
    const andConditions: Prisma.ProblemWhereInput[] = [];

    for (const cond of conditions) {
        switch (cond.type) {
            case 'grade':
                where.grade = cond.value;
                break;
            case 'subjectId':
                where.subjectId = cond.value;
                break;
            case 'coreProblemId':
                andConditions.push({
                    coreProblems: { some: { id: cond.value } },
                });
                break;
            case 'videoStatus':
                where.videoStatus = cond.value as VideoStatus;
                break;
            case 'search':
                where.OR = [
                    ...SEARCH_SCALAR_FIELDS.map((field) => ({
                        [field]: { contains: cond.value, mode: 'insensitive' as const },
                    })),
                    {
                        coreProblems: {
                            some: {
                                name: { contains: cond.value, mode: 'insensitive' },
                            },
                        },
                    },
                ];
                if (/^\d+$/.test(cond.value)) {
                    const parsedMasterNumber = Number.parseInt(cond.value, 10);
                    if (Number.isSafeInteger(parsedMasterNumber)) {
                        where.OR.push({ masterNumber: parsedMasterNumber });
                    }
                }
                break;
            case 'problemType':
                where.problemType = cond.value as never;
                break;
            case 'status':
                where.status = cond.value as never;
                break;
        }
    }

    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    return where;
}

function buildProblemWhere(filters: ProblemFilters, search?: string): Prisma.ProblemWhereInput {
    const conditions = buildFilterConditions(filters, search);
    return conditionsToPrismaWhere(conditions);
}

async function getSubjectNameById(subjectId: string) {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { name: true },
    });

    if (!subject) {
        throw new Error('教科が見つかりません');
    }

    return subject.name;
}

function shouldPreserveProblemMasterNumber(subjectName: string) {
    return subjectName === '英語';
}

async function resolveSubjectIdFromCoreProblemIds(coreProblemIds: string[]) {
    if (coreProblemIds.length === 0) {
        throw new Error('CoreProblemは最低1件必要です');
    }

    const coreProblems = await prisma.coreProblem.findMany({
        where: { id: { in: coreProblemIds } },
        select: { id: true, subjectId: true },
    });

    if (coreProblems.length !== coreProblemIds.length) {
        throw new Error('存在しないCoreProblemが含まれています');
    }

    const subjectIds = new Set(coreProblems.map((coreProblem) => coreProblem.subjectId));
    if (subjectIds.size > 1) {
        throw new Error('複数教科のCoreProblemは紐付けできません');
    }

    return Array.from(subjectIds)[0]!;
}

async function getNextProblemOrder() {
    const lastProblem = await prisma.problem.findFirst({
        orderBy: { order: 'desc' },
        select: { order: true },
    });

    return (lastProblem?.order ?? 0) + 1;
}

function normalizeStructuredDraftInput(data: {
    document: unknown;
    answerSpec: unknown;
    printConfig?: unknown;
    correctAnswer: string | null | undefined;
    acceptedAnswers: readonly string[] | null | undefined;
}) {
    const document = parseStructuredDocument(data.document);
    const answerSpec = normalizeAnswerSpecForAuthoring(parseAnswerSpec(data.answerSpec));
    const printConfig = parsePrintConfig(data.printConfig ?? {});
    const answer = normalizeAnswerForAuthoring({
        correctAnswer: data.correctAnswer,
        acceptedAnswers: data.acceptedAnswers,
    });
    const legacy = deriveLegacyFieldsFromStructuredData({
        document,
        correctAnswer: answer.correctAnswer,
        acceptedAnswers: answer.acceptedAnswers,
    });

    return {
        document,
        answerSpec,
        printConfig,
        answer,
        legacy,
    };
}

async function mapProblemForEditor(problemId: string) {
    const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        include: problemAdminInclude,
    });

    if (!problem) return null;

    const revisions = await Promise.all(problem.revisions.map(async (revision) => ({
        ...revision,
        assets: await Promise.all(revision.assets.map(async (asset) => ({
            ...asset,
            signedUrl: asset.storageKey ? await createProblemAssetSignedUrl(asset.storageKey) : null,
        }))),
    })));

    const publishedRevision = problem.publishedRevision
        ? {
            ...problem.publishedRevision,
            assets: await Promise.all(problem.publishedRevision.assets.map(async (asset) => ({
                ...asset,
                signedUrl: asset.storageKey ? await createProblemAssetSignedUrl(asset.storageKey) : null,
            }))),
        }
        : null;

    return {
        ...problem,
        publishedRevision,
        revisions,
    };
}

export async function getProblems(
    page = 1,
    limit = 20,
    search = '',
    filters: ProblemFilters = {},
    sortBy: 'updatedAt' | 'createdAt' | 'customId' | 'masterNumber' = 'updatedAt',
    sortOrder: 'asc' | 'desc' = 'desc',
) {
    await requireProblemAuthor();
    try {
        const normalizedSearch = search.trim();
        const where = buildProblemWhere(filters, normalizedSearch || undefined);
        const skip = (page - 1) * limit;

        const orderBy: Prisma.ProblemOrderByWithRelationInput[] =
            sortBy === 'customId'
                ? [{ customIdSortKey: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }]
                : sortBy === 'createdAt'
                    ? [{ createdAt: sortOrder }, { id: 'asc' }]
                    : sortBy === 'masterNumber'
                        ? [{ masterNumber: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }]
                        : [{ updatedAt: sortOrder }, { id: 'asc' }];

        // 検索語が無い場合は従来通りのページネーション
        if (!normalizedSearch) {
            const [problems, total] = await Promise.all([
                prisma.problem.findMany({
                    where,
                    include: problemAdminInclude,
                    orderBy,
                    skip,
                    take: limit,
                }),
                prisma.problem.count({ where }),
            ]);
            return { success: true, problems, total, page, limit };
        }

        // 検索語があるときは完全一致を先頭に固定し、残りを既存の orderBy で並べる
        const filterOnlyWhere = buildProblemWhere(filters);
        const exactWhere: Prisma.ProblemWhereInput = {
            AND: [filterOnlyWhere, { OR: buildExactMatchSearchOR(normalizedSearch) }],
        };

        const exactIds = (
            await prisma.problem.findMany({
                where: exactWhere,
                select: { id: true },
                orderBy,
            })
        ).map((problem) => problem.id);

        const exactCount = exactIds.length;
        let pinnedPageIds: string[] = [];
        let restSkip = skip;
        let restTake = limit;

        if (skip < exactCount) {
            pinnedPageIds = exactIds.slice(skip, skip + limit);
            restSkip = 0;
            restTake = limit - pinnedPageIds.length;
        } else {
            restSkip = skip - exactCount;
        }

        const restWhere: Prisma.ProblemWhereInput =
            exactIds.length > 0 ? { AND: [where, { id: { notIn: exactIds } }] } : where;

        const [pinnedItems, restItems, total] = await Promise.all([
            pinnedPageIds.length > 0
                ? prisma.problem.findMany({
                      where: { id: { in: pinnedPageIds } },
                      include: problemAdminInclude,
                  })
                : Promise.resolve([] as Prisma.ProblemGetPayload<{ include: typeof problemAdminInclude }>[]),
            restTake > 0
                ? prisma.problem.findMany({
                      where: restWhere,
                      include: problemAdminInclude,
                      orderBy,
                      skip: restSkip,
                      take: restTake,
                  })
                : Promise.resolve([] as Prisma.ProblemGetPayload<{ include: typeof problemAdminInclude }>[]),
            prisma.problem.count({ where }),
        ]);

        // 完全一致の元の並び順を維持する
        const pinnedItemMap = new Map(pinnedItems.map((item) => [item.id, item]));
        const pinnedOrdered = pinnedPageIds
            .map((id) => pinnedItemMap.get(id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined);

        return {
            success: true,
            problems: [...pinnedOrdered, ...restItems],
            total,
            page,
            limit,
        };
    } catch (error) {
        console.error('Failed to get problems:', error);
        return { error: '問題の取得に失敗しました' };
    }
}

export async function getProblemSubjects() {
    await requireProblemAuthor();

    try {
        const subjects = await prisma.subject.findMany({
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            select: {
                id: true,
                name: true,
                coreProblems: {
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        name: true,
                        masterNumber: true,
                    },
                },
            },
        });

        return {
            success: true,
            subjects,
        };
    } catch (error) {
        console.error('Failed to get problem subjects:', error);
        return { error: '科目一覧の取得に失敗しました' };
    }
}

export async function getProblemNavSubjects() {
    await requireProblemAuthor();

    try {
        const subjects = await prisma.subject.findMany({
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            select: {
                id: true,
                name: true,
                order: true,
            },
        });

        return {
            success: true,
            subjects,
        };
    } catch (error) {
        console.error('Failed to get problem nav subjects:', error);
        return { error: '科目ナビゲーションの取得に失敗しました' };
    }
}

export async function getProblemEditorContext(problemId?: string) {
    await requireProblemAuthor();

    const [subjects, coreProblems, problem] = await Promise.all([
        prisma.subject.findMany({
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true },
        }),
        prisma.coreProblem.findMany({
            orderBy: [{ subject: { order: 'asc' } }, { order: 'asc' }],
            include: { subject: true },
        }),
        problemId ? mapProblemForEditor(problemId) : Promise.resolve(null),
    ]);

    return { subjects, coreProblems, problem };
}

export async function createStandaloneProblem(data: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    videoStatus?: VideoStatusValue;
    coreProblemIds: string[];
}) {
    await requireAdmin();
    try {
        const resolvedVideoStatus = resolveVideoStatusFromUrl(data.videoStatus, data.videoUrl);
        const problem = await createProblemCore({
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            videoUrl: data.videoUrl,
            videoStatus: resolvedVideoStatus,
            coreProblemIds: data.coreProblemIds,
            order: 0,
        });

        revalidateProblemPaths();
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to create problem:', error);
        return { error: '問題の作成に失敗しました' };
    }
}

export async function updateStandaloneProblem(id: string, data: {
    question?: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    videoStatus?: VideoStatusValue;
    coreProblemIds?: string[];
}) {
    await requireAdmin();
    try {
        const updateData: Prisma.ProblemUpdateInput = {
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers,
            grade: data.grade,
            videoUrl: data.videoUrl,
        };

        if (data.videoUrl !== undefined || data.videoStatus !== undefined) {
            const existing = await prisma.problem.findUnique({
                where: { id },
                select: { videoUrl: true, videoStatus: true },
            });
            if (!existing) {
                return { error: '問題が見つかりません' };
            }
            const nextVideoUrl = data.videoUrl !== undefined ? data.videoUrl : existing.videoUrl;
            const desiredStatus = data.videoStatus ?? (existing.videoStatus as VideoStatusValue);
            updateData.videoStatus = resolveVideoStatusFromUrl(desiredStatus, nextVideoUrl);
        }

        if (data.coreProblemIds) {
            const subjectId = await resolveSubjectIdFromCoreProblemIds(data.coreProblemIds);
            const subjectName = await getSubjectNameById(subjectId);
            updateData.coreProblems = {
                set: data.coreProblemIds.map((cid) => ({ id: cid })),
            };
            updateData.subject = {
                connect: { id: subjectId },
            };
            if (!shouldPreserveProblemMasterNumber(subjectName)) {
                updateData.masterNumber = null;
            }
        }

        const problem = await prisma.problem.update({
            where: { id },
            data: updateData,
            include: problemAdminInclude,
        });

        revalidateProblemPaths(id);
        return { success: true, problem };
    } catch (error) {
        console.error('Failed to update problem:', error);
        return { error: '問題の更新に失敗しました' };
    }
}

export async function createProblemDraft(data: {
    problemId?: string;
    problemType: string;
    grade?: string;
    videoUrl?: string;
    videoStatus?: VideoStatusValue;
    coreProblemIds: string[];
    authoringTool?: ProblemAuthoringTool;
    authoringState?: unknown;
    document: unknown;
    answerSpec: unknown;
    printConfig?: unknown;
    /**
     * Stage B' 以降、正解情報は answerSpec ではなく専用フィールドで受け取る。
     * 受け取った値は ProblemRevision.correctAnswer / acceptedAnswers (新カラム) に書き、
     * 公開リビジョンが未存在の場合のみ Problem.answer / acceptedAnswers にも同期する。
     */
    correctAnswer?: string | null;
    acceptedAnswers?: string[];
}) {
    await requireProblemAuthor();

    try {
        const normalized = normalizeStructuredDraftInput({
            document: data.document,
            answerSpec: data.answerSpec,
            printConfig: data.printConfig,
            correctAnswer: data.correctAnswer,
            acceptedAnswers: data.acceptedAnswers,
        });
        const subjectId = await resolveSubjectIdFromCoreProblemIds(data.coreProblemIds);
        const subjectName = await getSubjectNameById(subjectId);
        const legacyQuestion = normalized.legacy.question.trim() || '構造化問題';
        const legacyAnswer = normalized.legacy.answer.trim() || null;

        let problemId = data.problemId;
        let revisionId: string;

        await prisma.$transaction(async (tx) => {
            if (!problemId) {
                const customId = await getNextCustomId(subjectId, tx);
                const order = await getNextProblemOrder();
                const newVideoStatus = resolveVideoStatusFromUrl(data.videoStatus, data.videoUrl);
                const createdProblem = await tx.problem.create({
                    data: {
                        question: legacyQuestion,
                        answer: legacyAnswer,
                        acceptedAnswers: normalized.legacy.acceptedAnswers,
                        grade: data.grade,
                        videoUrl: data.videoUrl,
                        videoStatus: newVideoStatus,
                        customId,
                        subjectId,
                        order,
                        problemType: data.problemType as never,
                        status: 'DRAFT',
                        hasStructuredContent: true,
                        coreProblems: {
                            connect: data.coreProblemIds.map((id) => ({ id })),
                        },
                    },
                });
                problemId = createdProblem.id;
            } else {
                const existing = await tx.problem.findUnique({
                    where: { id: problemId },
                    select: { videoUrl: true, videoStatus: true, publishedRevisionId: true },
                });
                const nextVideoUrl = data.videoUrl !== undefined ? data.videoUrl : existing?.videoUrl ?? null;
                const desiredStatus = data.videoStatus ?? ((existing?.videoStatus as VideoStatusValue | undefined) ?? 'NONE');
                const problemUpdateData: Prisma.ProblemUpdateInput = {
                    grade: data.grade,
                    videoUrl: data.videoUrl,
                    videoStatus: resolveVideoStatusFromUrl(desiredStatus, nextVideoUrl),
                    subject: {
                        connect: { id: subjectId },
                    },
                    problemType: data.problemType as never,
                    status: 'DRAFT',
                    hasStructuredContent: true,
                    coreProblems: {
                        set: data.coreProblemIds.map((id) => ({ id })),
                    },
                };

                // 公開リビジョンが未存在の問題 (新規下書き編集) でのみ legacy フィールドを下書きと同期する。
                // 既に公開済み (publishedRevisionId !== null) の問題では legacy フィールドを
                // 公開時のスナップショットとして保持し、下書き保存で上書きしない。
                // 上書きすると配布済みプリントの採点が未公開ドラフトの正解で行われ、誤採点になる。
                if (!existing?.publishedRevisionId) {
                    problemUpdateData.question = legacyQuestion;
                    problemUpdateData.answer = legacyAnswer;
                    problemUpdateData.acceptedAnswers = normalized.legacy.acceptedAnswers;
                }

                if (!shouldPreserveProblemMasterNumber(subjectName)) {
                    problemUpdateData.masterNumber = null;
                }

                await tx.problem.update({
                    where: { id: problemId },
                    data: problemUpdateData,
                });
            }

            const existingDraft = await tx.problemRevision.findFirst({
                where: { problemId, status: 'DRAFT' },
                orderBy: { revisionNumber: 'desc' },
            });

            if (existingDraft) {
                const updated = await tx.problemRevision.update({
                    where: { id: existingDraft.id },
                    data: {
                        structuredContent: normalized.document as Prisma.InputJsonValue,
                        answerSpec: normalized.answerSpec as Prisma.InputJsonValue,
                        // Stage B': 正解情報は専用カラムに書く (answerSpec JSON からは除外する)
                        correctAnswer: normalized.answer.correctAnswer || null,
                        acceptedAnswers: normalized.answer.acceptedAnswers,
                        printConfig: normalized.printConfig as Prisma.InputJsonValue,
                        authoringTool: data.authoringTool ?? 'MANUAL',
                        authoringState: (data.authoringState ?? undefined) as Prisma.InputJsonValue | undefined,
                    },
                });
                revisionId = updated.id;
                return;
            }

            const latestRevision = await tx.problemRevision.findFirst({
                where: { problemId },
                orderBy: { revisionNumber: 'desc' },
                select: { revisionNumber: true },
            });

            const createdRevision = await tx.problemRevision.create({
                data: {
                    problemId,
                    revisionNumber: (latestRevision?.revisionNumber ?? 0) + 1,
                    status: 'DRAFT',
                    structuredContent: normalized.document as Prisma.InputJsonValue,
                    answerSpec: normalized.answerSpec as Prisma.InputJsonValue,
                    // Stage B': 正解情報は専用カラムに書く
                    correctAnswer: normalized.answer.correctAnswer || null,
                    acceptedAnswers: normalized.answer.acceptedAnswers,
                    printConfig: normalized.printConfig as Prisma.InputJsonValue,
                    authoringTool: data.authoringTool ?? 'MANUAL',
                    authoringState: (data.authoringState ?? undefined) as Prisma.InputJsonValue | undefined,
                },
            });
            revisionId = createdRevision.id;
        });

        revalidateProblemPaths(problemId);

        return {
            success: true,
            problemId,
            revisionId: revisionId!,
        };
    } catch (error) {
        console.error('Failed to save structured draft:', error);
        return { error: '構造化問題の保存に失敗しました' };
    }
}

export async function publishProblemRevision(problemId: string) {
    await requireProblemAuthor();

    try {
        const problem = await prisma.problem.findUnique({
            where: { id: problemId },
            include: {
                revisions: {
                    orderBy: { revisionNumber: 'desc' },
                },
            },
        });

        if (!problem) {
            return { error: '問題が見つかりません' };
        }

        const draftRevision = problem.revisions.find((revision) => revision.status === 'DRAFT');
        if (!draftRevision) {
            return { error: '公開可能な下書きがありません' };
        }

        // Stage B' 以降、正解情報は ProblemRevision の専用カラム (correctAnswer / acceptedAnswers) から読む。
        // 旧 answerSpec JSON 内の値は backfill 済みなので二重ソースにはしない。
        const normalized = normalizeStructuredDraftInput({
            document: draftRevision.structuredContent,
            answerSpec: draftRevision.answerSpec,
            printConfig: draftRevision.printConfig,
            correctAnswer: draftRevision.correctAnswer,
            acceptedAnswers: draftRevision.acceptedAnswers,
        });

        await prisma.$transaction(async (tx) => {
            if (problem.publishedRevisionId) {
                await tx.problemRevision.updateMany({
                    where: {
                        problemId,
                        id: { not: draftRevision.id },
                        status: 'PUBLISHED',
                    },
                    data: { status: 'SUPERSEDED' },
                });
            }

            await tx.problemRevision.update({
                where: { id: draftRevision.id },
                data: {
                    status: 'PUBLISHED',
                    publishedAt: new Date(),
                },
            });

            await tx.problem.update({
                where: { id: problemId },
                data: {
                    publishedRevisionId: draftRevision.id,
                    status: 'PUBLISHED',
                    sentBackReason: null,
                    hasStructuredContent: true,
                    question: normalized.legacy.question.trim() || '構造化問題',
                    answer: normalized.legacy.answer || null,
                    acceptedAnswers: normalized.legacy.acceptedAnswers,
                },
            });
        });

        revalidateProblemPaths(problemId);
        return { success: true };
    } catch (error) {
        console.error('Failed to publish problem revision:', error);
        return { error: '問題の公開に失敗しました' };
    }
}

export async function previewProblemPrint(params: {
    problemId: string;
    revisionId?: string;
}) {
    await requireProblemAuthor();
    const query = new URLSearchParams();
    if (params.revisionId) query.set('revisionId', params.revisionId);

    return {
        success: true,
        url: `/api/admin/problems/${params.problemId}/preview${query.size > 0 ? `?${query.toString()}` : ''}`,
    };
}

export async function uploadProblemAsset(formData: FormData) {
    await requireProblemAuthor();

    try {
        const problemId = String(formData.get('problemId') || '');
        const revisionId = String(formData.get('revisionId') || '');
        const kind = String(formData.get('kind') || 'IMAGE');
        const sourceTool = String(formData.get('sourceTool') || 'UPLOAD');
        const inlineContent = String(formData.get('inlineContent') || '').trim();
        const file = formData.get('file');

        if (!problemId || !revisionId) {
            return { error: 'problemId と revisionId が必要です' };
        }

        let storageKey: string | undefined;
        let checksum: string | undefined;
        let mimeType = 'text/plain';
        let fileName = `${kind.toLowerCase()}.txt`;

        if (file instanceof File && file.size > 0) {
            const uploaded = await uploadProblemAssetToStorage({
                problemId,
                revisionId,
                file,
            });
            storageKey = uploaded.storageKey;
            checksum = uploaded.checksum;
            mimeType = uploaded.mimeType;
            fileName = file.name;
        } else if (!inlineContent) {
            return { error: 'ファイルまたは inlineContent が必要です' };
        }

        const asset = await prisma.problemAsset.create({
            data: {
                problemRevisionId: revisionId,
                kind: kind as never,
                fileName,
                storageKey,
                mimeType,
                checksum,
                sourceTool: sourceTool as never,
                inlineContent: inlineContent || undefined,
            },
        });

        revalidateProblemPaths(problemId);
        return { success: true, asset };
    } catch (error) {
        console.error('Failed to upload problem asset:', error);
        return { error: 'アセットの保存に失敗しました' };
    }
}

export async function deleteProblemAsset(assetId: string) {
    await requireAdmin();

    try {
        const asset = await prisma.problemAsset.findUnique({
            where: { id: assetId },
            include: { problemRevision: { select: { problemId: true } } },
        });

        if (!asset) {
            return { error: 'アセットが見つかりません' };
        }

        await prisma.problemAsset.delete({
            where: { id: assetId },
        });
        await removeProblemAssetFromStorage(asset.storageKey);

        revalidatePath(`/admin/problems/${asset.problemRevision.problemId}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to delete problem asset:', error);
        return { error: 'アセットの削除に失敗しました' };
    }
}

export async function updateProblemStatus(id: string, status: ProblemStatusValue) {
    await requireProblemAuthor();

    try {
        if (!isProblemStatusValue(status)) {
            return { error: '不正なステータスです' };
        }

        if (status === 'SENT_BACK') {
            return { error: '差し戻しは sendBackProblem を使ってください' };
        }

        const problem = await prisma.problem.update({
            where: { id },
            data: {
                status,
                sentBackReason: null,
            },
            select: { id: true, status: true },
        });

        revalidateProblemPaths(id);
        return { success: true, status: problem.status as ProblemStatusValue };
    } catch (error) {
        console.error('Failed to update problem status:', error);
        return { error: 'ステータスの更新に失敗しました' };
    }
}

export async function sendBackProblem(id: string, reason: string) {
    await requireProblemAuthor();

    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (trimmed.length === 0) {
        return { error: '差し戻し理由を入力してください' };
    }
    if (trimmed.length > SENT_BACK_REASON_MAX) {
        return { error: `差し戻し理由は${SENT_BACK_REASON_MAX}文字以内で入力してください` };
    }

    try {
        const problem = await prisma.problem.update({
            where: { id },
            data: {
                status: 'SENT_BACK',
                sentBackReason: trimmed,
            },
            select: { id: true, status: true, sentBackReason: true },
        });

        revalidateProblemPaths(id);
        return { success: true, status: problem.status as ProblemStatusValue, sentBackReason: problem.sentBackReason };
    } catch (error) {
        console.error('Failed to send back problem:', error);
        return { error: '差し戻しに失敗しました' };
    }
}

export async function updateProblemVideoStatus(id: string, videoStatus: VideoStatusValue) {
    await requireProblemAuthor();

    try {
        if (!isVideoStatusValue(videoStatus)) {
            return { error: '不正な動画ステータスです' };
        }

        const existing = await prisma.problem.findUnique({
            where: { id },
            select: { videoUrl: true },
        });

        if (!existing) {
            return { error: '問題が見つかりません' };
        }

        const resolved = resolveVideoStatusFromUrl(videoStatus, existing.videoUrl);

        const problem = await prisma.problem.update({
            where: { id },
            data: { videoStatus: resolved },
            select: { id: true, videoStatus: true },
        });

        revalidateProblemPaths(id);
        return { success: true, videoStatus: problem.videoStatus as VideoStatusValue };
    } catch (error) {
        console.error('Failed to update problem video status:', error);
        return { error: '動画ステータスの更新に失敗しました' };
    }
}

export async function deleteStandaloneProblem(id: string) {
    await requireAdmin();
    try {
        await deleteProblemsWithRelations([id]);

        revalidateProblemPaths();
        return { success: true };
    } catch (error) {
        console.error('Failed to delete problem:', error);
        return { error: '問題の削除に失敗しました' };
    }
}

export async function bulkDeleteProblems(ids: string[]) {
    await requireAdmin();
    try {
        if (ids.length === 0) return { success: true, count: 0 };

        const deletedCount = await deleteProblemsWithRelations(ids);

        revalidateProblemPaths();
        return { success: true, count: deletedCount };
    } catch (error) {
        console.error('Failed to bulk delete problems:', error);
        return { error: '問題の一括削除に失敗しました' };
    }
}

export async function bulkSearchCoreProblems(names: string[]) {
    await requireProblemAuthor();
    try {
        const uniqueNames = [...new Set(names.map((name) => name.trim()))].filter(Boolean);
        if (uniqueNames.length === 0) {
            return { success: true, coreProblemsMap: {} };
        }

        const ordering: Prisma.CoreProblemOrderByWithRelationInput[] = [
            { subject: { order: 'asc' } },
            { order: 'asc' },
        ];

        const exactCandidates = await prisma.coreProblem.findMany({
            where: {
                OR: uniqueNames.map((name) => ({
                    name: { equals: name, mode: 'insensitive' },
                })),
            },
            include: { subject: true },
            orderBy: ordering,
        });

        const exactMatchMap = new Map<string, (typeof exactCandidates)[number]>();
        exactCandidates.forEach((coreProblem) => {
            const key = coreProblem.name.toLowerCase();
            if (!exactMatchMap.has(key)) {
                exactMatchMap.set(key, coreProblem);
            }
        });

        const unresolvedNames = uniqueNames.filter((name) => !exactMatchMap.has(name.toLowerCase()));
        const partialMatchMap = new Map<string, (typeof exactCandidates)[number]>();

        if (unresolvedNames.length > 0) {
            const partialCandidates = await prisma.coreProblem.findMany({
                where: {
                    OR: unresolvedNames.map((name) => ({
                        name: { contains: name, mode: 'insensitive' },
                    })),
                },
                include: { subject: true },
                orderBy: ordering,
            });

            const unresolvedNameSet = new Set(unresolvedNames.map((name) => name.toLowerCase()));
            for (const candidate of partialCandidates) {
                if (unresolvedNameSet.size === 0) break;
                const candidateLower = candidate.name.toLowerCase();
                for (const unresolvedName of Array.from(unresolvedNameSet)) {
                    if (candidateLower.includes(unresolvedName)) {
                        partialMatchMap.set(unresolvedName, candidate);
                        unresolvedNameSet.delete(unresolvedName);
                    }
                }
            }
        }

        const resultMap: Record<string, (typeof exactCandidates)[number] | null> = {};
        for (const name of uniqueNames) {
            const normalized = name.toLowerCase();
            resultMap[name] = exactMatchMap.get(normalized) || partialMatchMap.get(normalized) || null;
        }

        return { success: true, coreProblemsMap: resultMap };
    } catch (error) {
        console.error('Failed to bulk search core problems:', error);
        return { error: 'CoreProblemの一括検索に失敗しました' };
    }
}

export async function bulkUpsertStandaloneProblems(problems: {
    question: string;
    answer?: string;
    acceptedAnswers?: string[];
    grade?: string;
    masterNumber?: number;
    videoUrl?: string;
    videoStatus?: VideoStatusValue;
    coreProblemIds: string[];
}[], options?: { subjectId?: string }) {
    await requireProblemAuthor();
    try {
        const { createdCount, updatedCount, warnings } = await bulkUpsertProblemsCore(
            problems,
            { batchSize: 50, assignOrder: false, subjectId: options?.subjectId },
        );

        revalidateProblemPaths();
        return { success: true, createdCount, updatedCount, warnings };
    } catch (error) {
        console.error('Failed to bulk upsert problems:', error);
        return { error: '一括登録・更新に失敗しました' };
    }
}

export async function searchProblemsByMasterNumbers(targets: { masterNumber: number; subjectId: string }[]) {
    await requireProblemAuthor();
    try {
        if (targets.length === 0) return { success: true, problems: [] };

        const dedupedTargets = Array.from(
            new Map(targets.map((target) => [`${target.subjectId}:${target.masterNumber}`, target])).values(),
        );

        const problems = await prisma.problem.findMany({
            where: {
                OR: dedupedTargets.map((target) => ({
                    subjectId: target.subjectId,
                    masterNumber: target.masterNumber,
                })),
            },
            include: problemAdminInclude,
        });

        return { success: true, problems };
    } catch (error) {
        console.error('Failed to search problems by master numbers:', error);
        return { error: '既存問題の検索に失敗しました' };
    }
}
