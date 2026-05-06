'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, ProblemAuthoringTool, VideoStatus } from '@prisma/client';

import { requireAdmin, requireProblemAuthor } from '@/lib/auth';
import { generateProblemFigureScene } from '@/lib/problem-figure-generation';
import { figureGenerationTargetSchema, type FigureGenerationTarget, isAiFigureGenerationSupported } from '@/lib/problem-figure-scene';
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
    buildDefaultStructuredDraft,
    deriveLegacyFieldsFromStructuredData,
    normalizeAnswerSpecForAuthoring,
    parseAnswerSpec,
    parsePrintConfig,
    parseStructuredDocument,
} from '@/lib/structured-problem';
import { createProblemAssetSignedUrl, removeProblemAssetFromStorage, uploadProblemAssetToStorage } from '@/lib/problem-assets';
import { ensureRenderableSvgMarkup } from '@/lib/problem-svg';
import { problemAdminInclude } from './types';

type ProblemFilters = {
    grade?: string;
    subjectId?: string;
    coreProblemId?: string;
    videoStatus?: VideoStatusValue;
    problemType?: string;
    contentFormat?: string;
    status?: string;
};

type FilterCondition =
    | { type: 'grade'; value: string }
    | { type: 'subjectId'; value: string }
    | { type: 'coreProblemId'; value: string }
    | { type: 'search'; value: string }
    | { type: 'videoStatus'; value: VideoStatusValue }
    | { type: 'problemType'; value: string }
    | { type: 'contentFormat'; value: string }
    | { type: 'status'; value: string };

const SEARCH_SCALAR_FIELDS = ['question', 'answer', 'customId'] as const;

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
    if (filters.contentFormat) conditions.push({ type: 'contentFormat', value: filters.contentFormat });
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
            case 'contentFormat':
                where.contentFormat = cond.value as never;
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
}) {
    const document = parseStructuredDocument(data.document);
    const answerSpec = normalizeAnswerSpecForAuthoring(parseAnswerSpec(data.answerSpec));
    const printConfig = parsePrintConfig(data.printConfig ?? {});
    const legacy = deriveLegacyFieldsFromStructuredData({ document, answerSpec });

    return {
        document,
        answerSpec,
        printConfig,
        legacy,
    };
}

async function ensureProblemDraftRevision(params: {
    problemId: string;
    requestedRevisionId?: string;
    createdByUserId?: string;
}) {
    const problem = await prisma.problem.findUnique({
        where: { id: params.problemId },
        include: {
            publishedRevision: true,
            revisions: {
                orderBy: { revisionNumber: 'desc' },
            },
        },
    });

    if (!problem) {
        throw new Error('問題が見つかりません');
    }

    const requestedRevision = params.requestedRevisionId
        ? problem.revisions.find((revision) => revision.id === params.requestedRevisionId)
        : null;
    if (requestedRevision?.status === 'DRAFT') {
        return { problem, draftRevision: requestedRevision };
    }

    const existingDraft = problem.revisions.find((revision) => revision.status === 'DRAFT');
    if (existingDraft) {
        return { problem, draftRevision: existingDraft };
    }

    const defaultDraft = buildDefaultStructuredDraft(problem.problemType);
    const sourceRevision = requestedRevision ?? problem.publishedRevision ?? problem.revisions[0] ?? null;
    const latestRevisionNumber = problem.revisions[0]?.revisionNumber ?? 0;
    const draftRevision = await prisma.$transaction(async (tx) => {
        const createdRevision = await tx.problemRevision.create({
            data: {
                problemId: problem.id,
                revisionNumber: latestRevisionNumber + 1,
                status: 'DRAFT',
                structuredContent: (sourceRevision?.structuredContent ?? defaultDraft.document) as Prisma.InputJsonValue,
                answerSpec: (sourceRevision?.answerSpec ?? defaultDraft.answerSpec) as Prisma.InputJsonValue,
                printConfig: (sourceRevision?.printConfig ?? defaultDraft.printConfig) as Prisma.InputJsonValue,
                generationContext: (sourceRevision?.generationContext ?? undefined) as Prisma.InputJsonValue | undefined,
                authoringTool: sourceRevision?.authoringTool ?? 'MANUAL',
                authoringState: (sourceRevision?.authoringState ?? undefined) as Prisma.InputJsonValue | undefined,
                createdByUserId: params.createdByUserId,
            },
        });

        await tx.problem.update({
            where: { id: problem.id },
            data: {
                status: 'DRAFT',
                hasStructuredContent: true,
                contentFormat: 'STRUCTURED_V1',
            },
        });

        return createdRevision;
    });

    return { problem, draftRevision };
}

function resolveVendorStateAssetKind(authoringTool: ProblemAuthoringTool) {
    switch (authoringTool) {
        case 'DESMOS':
            return 'DESMOS_STATE' as const;
        case 'GEOGEBRA':
            return 'GEOGEBRA_STATE' as const;
        default:
            return 'JSON' as const;
    }
}

async function upsertInlineProblemAsset(input: {
    revisionId: string;
    kind: 'SVG' | 'DESMOS_STATE' | 'GEOGEBRA_STATE' | 'JSON';
    fileName: string;
    mimeType: string;
    sourceTool: ProblemAuthoringTool;
    inlineContent: string;
    metadata?: Prisma.InputJsonValue;
}) {
    const existingAssets = await prisma.problemAsset.findMany({
        where: {
            problemRevisionId: input.revisionId,
            kind: input.kind as never,
            sourceTool: input.sourceTool,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const primary = existingAssets[0];
    const redundant = existingAssets.slice(1);

    for (const asset of existingAssets) {
        if (asset.storageKey) {
            await removeProblemAssetFromStorage(asset.storageKey);
        }
    }

    if (redundant.length > 0) {
        await prisma.problemAsset.deleteMany({
            where: {
                id: {
                    in: redundant.map((asset) => asset.id),
                },
            },
        });
    }

    if (primary) {
        return prisma.problemAsset.update({
            where: { id: primary.id },
            data: {
                fileName: input.fileName,
                mimeType: input.mimeType,
                sourceTool: input.sourceTool,
                storageKey: null,
                checksum: null,
                inlineContent: input.inlineContent,
                metadata: input.metadata,
            },
        });
    }

    return prisma.problemAsset.create({
        data: {
            problemRevisionId: input.revisionId,
            kind: input.kind as never,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sourceTool: input.sourceTool,
            inlineContent: input.inlineContent,
            metadata: input.metadata,
        },
    });
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

        if (sortBy === 'customId') {
            // 1. WHERE に一致する Problem の id だけを取得（payload を id のみに絞る）
            const allIdRows = await prisma.problem.findMany({
                where,
                select: { id: true },
            });
            const total = allIdRows.length;
            if (total === 0) {
                return { success: true, problems: [], total: 0, page, limit };
            }
            const allIds = allIdRows.map((row) => row.id);

            // 2. PostgreSQL 側の関数ベース index を使って自然順 ORDER BY + LIMIT を 1 クエリで実行
            const orderDir = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
            const pagedRows = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "Problem"
                WHERE "id" IN (${Prisma.join(allIds)})
                ORDER BY public.problem_custom_id_sort_key("customId") ${orderDir} NULLS LAST,
                         "id" ASC
                LIMIT ${limit}
                OFFSET ${skip}
            `;
            const pagedIds = pagedRows.map((row) => row.id);

            // 3. ページ分の詳細だけを include で取得し、SQL 側の順序を保つ
            const pageProblems = pagedIds.length === 0
                ? []
                : await prisma.problem.findMany({
                    where: { id: { in: pagedIds } },
                    include: problemAdminInclude,
                });
            const indexMap = new Map(pagedIds.map((id, index) => [id, index]));
            pageProblems.sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));
            return { success: true, problems: pageProblems, total, page, limit };
        }

        const orderBy: Prisma.ProblemOrderByWithRelationInput[] =
            sortBy === 'createdAt'
                ? [{ createdAt: sortOrder }, { id: 'asc' }]
                : sortBy === 'masterNumber'
                    ? [{ masterNumber: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }]
                    : [{ updatedAt: sortOrder }, { id: 'asc' }];

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
}) {
    await requireProblemAuthor();

    try {
        const normalized = normalizeStructuredDraftInput(data);
        const subjectId = await resolveSubjectIdFromCoreProblemIds(data.coreProblemIds);
        const subjectName = await getSubjectNameById(subjectId);
        const contentFormat = 'STRUCTURED_V1';
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
                        contentFormat: contentFormat as never,
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
                    select: { videoUrl: true, videoStatus: true },
                });
                const nextVideoUrl = data.videoUrl !== undefined ? data.videoUrl : existing?.videoUrl ?? null;
                const desiredStatus = data.videoStatus ?? ((existing?.videoStatus as VideoStatusValue | undefined) ?? 'NONE');
                const problemUpdateData: Prisma.ProblemUpdateInput = {
                    question: legacyQuestion,
                    answer: legacyAnswer,
                    acceptedAnswers: normalized.legacy.acceptedAnswers,
                    grade: data.grade,
                    videoUrl: data.videoUrl,
                    videoStatus: resolveVideoStatusFromUrl(desiredStatus, nextVideoUrl),
                    subject: {
                        connect: { id: subjectId },
                    },
                    problemType: data.problemType as never,
                    contentFormat: contentFormat as never,
                    status: 'DRAFT',
                    hasStructuredContent: true,
                    coreProblems: {
                        set: data.coreProblemIds.map((id) => ({ id })),
                    },
                };

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

        const normalized = normalizeStructuredDraftInput({
            document: draftRevision.structuredContent,
            answerSpec: draftRevision.answerSpec,
            printConfig: draftRevision.printConfig,
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
                    hasStructuredContent: true,
                    contentFormat: 'STRUCTURED_V1',
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

export async function generateProblemFigureDraft(input: {
    problemId: string;
    revisionId?: string;
    sourceProblemText: string;
    extraPrompt?: string;
    targetTool: FigureGenerationTarget;
}) {
    const session = await requireProblemAuthor();

    try {
        const sourceProblemText = input.sourceProblemText.trim();
        const targetTool = figureGenerationTargetSchema.parse(input.targetTool);
        if (!sourceProblemText) {
            return { error: '問題文テキストを入力してください' };
        }

        const { problem, draftRevision } = await ensureProblemDraftRevision({
            problemId: input.problemId,
            requestedRevisionId: input.revisionId,
            createdByUserId: session.userId,
        });

        if (!isAiFigureGenerationSupported(problem.problemType)) {
            return { error: 'AI図版生成は GEOMETRY / GRAPH_DRAW のみ対応しています' };
        }

        const generated = await generateProblemFigureScene({
            targetTool,
            problemType: problem.problemType,
            sourceProblemText,
            extraPrompt: input.extraPrompt?.trim(),
        });

        const generationContext = {
            sourceProblemText,
            extraPrompt: input.extraPrompt?.trim() || '',
            targetTool,
            modelName: generated.modelName,
            generatedAt: new Date().toISOString(),
            sceneSpecKind: generated.sceneSpecKind,
            sceneSpecDigest: generated.sceneSpecDigest,
        } satisfies Prisma.InputJsonValue;

        await prisma.problemRevision.update({
            where: { id: draftRevision.id },
            data: {
                generationContext,
            },
        });

        revalidateProblemPaths(problem.id);

        return {
            success: true,
            problemId: problem.id,
            revisionId: draftRevision.id,
            targetTool,
            sceneSpec: generated.sceneSpec,
            sceneSpecKind: generated.sceneSpecKind,
            modelName: generated.modelName,
        };
    } catch (error) {
        console.error('Failed to generate problem figure draft:', error);
        return { error: error instanceof Error ? error.message : 'AI 図版生成に失敗しました' };
    }
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

export async function syncProblemAuthoringArtifacts(input: {
    problemId: string;
    revisionId: string;
    authoringTool: ProblemAuthoringTool;
    authoringState: unknown;
    svgContent?: string;
}) {
    await requireProblemAuthor();

    try {
        const revision = await prisma.problemRevision.findFirst({
            where: {
                id: input.revisionId,
                problemId: input.problemId,
            },
            select: {
                id: true,
                problemId: true,
            },
        });

        if (!revision) {
            return { error: 'revision が見つかりません' };
        }

        await prisma.problemRevision.update({
            where: { id: revision.id },
            data: {
                authoringTool: input.authoringTool,
                authoringState: (input.authoringState ?? undefined) as Prisma.InputJsonValue | undefined,
            },
        });

        const shouldPersistStateAsset = input.authoringTool === 'DESMOS' || input.authoringTool === 'GEOGEBRA';
        const stateAsset = shouldPersistStateAsset
            ? await upsertInlineProblemAsset({
                revisionId: revision.id,
                kind: resolveVendorStateAssetKind(input.authoringTool),
                fileName: `${input.authoringTool.toLowerCase()}-state.json`,
                mimeType: 'application/json',
                sourceTool: input.authoringTool,
                inlineContent: JSON.stringify(input.authoringState ?? {}, null, 2),
                metadata: {
                    authoringTool: input.authoringTool,
                    generatedAt: new Date().toISOString(),
                } as Prisma.InputJsonValue,
            })
            : null;

        const normalizedSvgContent = input.svgContent?.trim()
            ? ensureRenderableSvgMarkup(input.svgContent.trim())
            : '';

        let svgAsset = null;
        if (normalizedSvgContent) {
            svgAsset = await upsertInlineProblemAsset({
                revisionId: revision.id,
                kind: 'SVG',
                fileName: `${input.authoringTool.toLowerCase()}-export.svg`,
                mimeType: 'image/svg+xml',
                sourceTool: input.authoringTool,
                inlineContent: normalizedSvgContent,
                metadata: {
                    authoringTool: input.authoringTool,
                    generatedAt: new Date().toISOString(),
                    exportFormat: 'svg',
                } as Prisma.InputJsonValue,
            });
        }

        revalidateProblemPaths(input.problemId);

        return {
            success: true,
            stateAsset,
            svgAsset,
        };
    } catch (error) {
        console.error('Failed to sync problem authoring artifacts:', error);
        return { error: 'vendor アセットの同期に失敗しました' };
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

        const problem = await prisma.problem.update({
            where: { id },
            data: { status },
            select: { id: true, status: true },
        });

        revalidateProblemPaths(id);
        return { success: true, status: problem.status as ProblemStatusValue };
    } catch (error) {
        console.error('Failed to update problem status:', error);
        return { error: 'ステータスの更新に失敗しました' };
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
