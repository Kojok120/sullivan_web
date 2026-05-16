'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { getTranslations } from 'next-intl/server';

import { requireProblemAuthor, getSession } from '@/lib/auth';
import type { LectureVideo } from '@/lib/lecture-videos';

function revalidateCurriculumPaths() {
    revalidatePath('/admin/curriculum');
    revalidatePath('/materials/core-problems');
}

// --- Subjects ---
export async function getSubjects() {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        const { fetchSubjects } = await import('@/lib/curriculum-service');
        // Updated fetchSubjects should handle includeCoreProblems correctly without Units
        const subjects = await fetchSubjects({ includeCoreProblems: true });
        return { success: true, subjects };
    } catch (error) {
        console.error('Failed to fetch subjects:', error);
        return { error: t('subjectsLoadFailed') };
    }
}

// --- CoreProblems ---
// 講義動画の型
export type { LectureVideo };

function toLectureVideosJson(videos?: LectureVideo[]): Prisma.InputJsonValue | undefined {
    if (!videos) return undefined;
    return videos as unknown as Prisma.InputJsonValue;
}

function normalizeCoreProblemName(name: string): string {
    return name.trim();
}

function normalizeLectureVideos(videos?: LectureVideo[]): LectureVideo[] {
    if (!videos) return [];
    return videos
        .map((video) => ({
            title: video.title.trim(),
            url: video.url.trim(),
        }))
        .filter((video) => video.title.length > 0 && video.url.length > 0);
}

function areLectureVideosEqual(a: LectureVideo[], b: LectureVideo[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((video, index) => {
        const target = b[index];
        return target && video.title === target.title && video.url === target.url;
    });
}

type CurriculumActionsTranslator = Awaited<ReturnType<typeof getTranslations>>;

function extractUniqueConstraintMessage(error: unknown, t: CurriculumActionsTranslator): string | null {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return null;
    }
    if (error.code !== 'P2002') {
        return null;
    }
    const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(',') : String(error.meta?.target || '');
    if (target.includes('subjectId') && target.includes('masterNumber')) {
        return t('duplicateMasterNumber');
    }
    return t('uniqueConstraint');
}

const CORE_PROBLEM_RESEQUENCE_OFFSET = 1_000_000;

async function bulkUpdateCoreProblemOrdersInTransaction(
    tx: Prisma.TransactionClient,
    updates: Array<{ id: string; order: number }>,
) {
    if (updates.length === 0) {
        return;
    }

    // 逐次 update を避けるため、VALUES テーブルでまとめて反映する。
    await tx.$executeRaw(Prisma.sql`
        UPDATE "CoreProblem" AS cp
        SET "order" = next_values."order"
        FROM (
            VALUES ${Prisma.join(updates.map((update) => Prisma.sql`(${update.id}, ${update.order})`))}
        ) AS next_values(id, "order")
        WHERE cp.id = next_values.id
    `);
}

async function bulkResequenceCoreProblemsInTransaction(
    tx: Prisma.TransactionClient,
    updates: Array<{ id: string; order: number; masterNumber: number }>,
) {
    if (updates.length === 0) {
        return;
    }

    await tx.$executeRaw(Prisma.sql`
        UPDATE "CoreProblem" AS cp
        SET
            "order" = next_values."order",
            "masterNumber" = next_values."masterNumber"
        FROM (
            VALUES ${Prisma.join(updates.map((update) => Prisma.sql`(${update.id}, ${update.order}, ${update.masterNumber})`))}
        ) AS next_values(id, "order", "masterNumber")
        WHERE cp.id = next_values.id
    `);
}

async function resequenceCoreProblemsInTransaction(subjectId: string, tx: Prisma.TransactionClient) {
    const orderedCoreProblems = await tx.coreProblem.findMany({
        where: { subjectId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, order: true, masterNumber: true },
    });

    if (orderedCoreProblems.length === 0) {
        return;
    }

    const needsResequence = orderedCoreProblems.some((coreProblem, index) => {
        const expected = index + 1;
        return coreProblem.order !== expected || coreProblem.masterNumber !== expected;
    });
    if (!needsResequence) {
        return;
    }

    // 一意制約衝突を避けるため、先に十分大きな値へ退避してから再採番する
    await tx.coreProblem.updateMany({
        where: { subjectId },
        data: {
            order: { increment: CORE_PROBLEM_RESEQUENCE_OFFSET },
            masterNumber: { increment: CORE_PROBLEM_RESEQUENCE_OFFSET },
        },
    });

    await bulkResequenceCoreProblemsInTransaction(
        tx,
        orderedCoreProblems.map((coreProblem, index) => {
            const resequencedNumber = index + 1;
            return {
                id: coreProblem.id,
                order: resequencedNumber,
                masterNumber: resequencedNumber,
            };
        }),
    );
}

async function resequenceCoreProblemsForSubject(subjectId: string) {
    await prisma.$transaction(async (tx) => {
        await resequenceCoreProblemsInTransaction(subjectId, tx);
    });
}

export async function getCoreProblemsForSubject(subjectId: string) {
    const session = await getSession();
    const t = await getTranslations('AdminCurriculumActions');
    if (!session || (session.role !== 'TEACHER' && session.role !== 'HEAD_TEACHER' && session.role !== 'ADMIN')) {
        return { error: t('unauthorized') };
    }

    try {
        const coreProblems = await prisma.coreProblem.findMany({
            where: { subjectId },
            orderBy: { order: 'asc' },
            select: { id: true, name: true, masterNumber: true }
        });
        return { success: true, coreProblems };
    } catch (error) {
        console.error('Failed to get core problems', error);
        return { error: t('coreProblemsLoadFailed') };
    }
}

export async function createCoreProblem(data: {
    name: string;
    masterNumber?: number;
    subjectId: string;
    order?: number;
    lectureVideos?: LectureVideo[];
}) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        const coreProblem = await prisma.$transaction(async (tx) => {
            const lastCoreProblem = await tx.coreProblem.findFirst({
                where: { subjectId: data.subjectId },
                orderBy: { order: 'desc' },
                select: { order: true, masterNumber: true },
            });

            const created = await tx.coreProblem.create({
                data: {
                    name: normalizeCoreProblemName(data.name),
                    masterNumber: (lastCoreProblem?.masterNumber ?? 0) + 1,
                    subjectId: data.subjectId,
                    order: data.order ?? (lastCoreProblem?.order ?? 0) + 1,
                    lectureVideos: toLectureVideosJson(normalizeLectureVideos(data.lectureVideos)),
                },
            });

            await resequenceCoreProblemsInTransaction(data.subjectId, tx);
            return created;
        });

        revalidateCurriculumPaths();
        return { success: true, coreProblem };
    } catch (error) {
        console.error('Failed to create core problem:', error);
        const uniqueMessage = extractUniqueConstraintMessage(error, t);
        if (uniqueMessage) {
            return { error: uniqueMessage };
        }
        return { error: t('coreProblemCreateFailed') };
    }
}

export async function updateCoreProblem(id: string, data: { name?: string; masterNumber?: number; order?: number; lectureVideos?: LectureVideo[] }) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        const existing = await prisma.coreProblem.findUnique({
            where: { id },
            select: { subjectId: true },
        });
        if (!existing) {
            return { error: t('coreProblemNotFound') };
        }

        const updateData: Prisma.CoreProblemUpdateInput = {};
        if (typeof data.name === 'string') {
            updateData.name = normalizeCoreProblemName(data.name);
        }
        if (typeof data.order === 'number') {
            updateData.order = data.order;
        }
        if (data.lectureVideos !== undefined) {
            updateData.lectureVideos = toLectureVideosJson(normalizeLectureVideos(data.lectureVideos));
        }

        const coreProblem = await prisma.$transaction(async (tx) => {
            const updated = await tx.coreProblem.update({
                where: { id },
                data: updateData,
            });

            if (typeof data.order === 'number') {
                await resequenceCoreProblemsInTransaction(existing.subjectId, tx);
            }

            return updated;
        });

        revalidateCurriculumPaths();
        return { success: true, coreProblem };
    } catch (error) {
        console.error('Failed to update core problem:', error);
        const uniqueMessage = extractUniqueConstraintMessage(error, t);
        if (uniqueMessage) {
            return { error: uniqueMessage };
        }
        return { error: t('coreProblemUpdateFailed') };
    }
}

export async function searchCoreProblemsForBulkUpsert(
    subjectId: string,
    masterNumbers: number[],
    names: string[]
) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        if (masterNumbers.length === 0 && names.length === 0) {
            return { success: true, coreProblems: [] };
        }

        const orConditions: Prisma.CoreProblemWhereInput[] = [];
        if (masterNumbers.length > 0) {
            orConditions.push({ masterNumber: { in: masterNumbers } });
        }
        if (names.length > 0) {
            orConditions.push({ name: { in: names } });
        }

        const coreProblems = await prisma.coreProblem.findMany({
            where: {
                subjectId,
                OR: orConditions,
            },
            select: {
                id: true,
                name: true,
                masterNumber: true,
                lectureVideos: true,
                order: true,
            },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
        });

        return { success: true, coreProblems };
    } catch (error) {
        console.error('Failed to search core problems for bulk upsert:', error);
        return { error: t('coreProblemSearchFailed') };
    }
}

export async function deleteCoreProblem(id: string) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        const target = await prisma.coreProblem.findUnique({
            where: { id },
            select: { subjectId: true },
        });
        if (!target) {
            return { error: t('coreProblemNotFound') };
        }

        await prisma.$transaction(async (tx) => {
            await tx.coreProblem.delete({ where: { id } });
            await resequenceCoreProblemsInTransaction(target.subjectId, tx);
        });

        revalidateCurriculumPaths();
        return { success: true };
    } catch (error) {
        console.error('Failed to delete core problem:', error);
        return { error: t('coreProblemDeleteFailed') };
    }
}

export async function bulkDeleteCoreProblems(ids: string[]) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        if (ids.length === 0) return { success: true, count: 0 };

        const targets = await prisma.coreProblem.findMany({
            where: { id: { in: ids } },
            select: { subjectId: true },
        });
        const subjectIds = Array.from(new Set(targets.map((target) => target.subjectId)));

        const result = await prisma.coreProblem.deleteMany({
            where: { id: { in: ids } }
        });

        for (const subjectId of subjectIds) {
            await resequenceCoreProblemsForSubject(subjectId);
        }

        revalidateCurriculumPaths();
        return { success: true, count: result.count };
    } catch (error) {
        console.error('Failed to bulk delete core problems:', error);
        return { error: t('coreProblemBulkDeleteFailed') };
    }
}

export async function bulkCreateCoreProblems(subjectId: string, items: {
    masterNumber: number;
    name: string;
    lectureVideos?: LectureVideo[];
}[]) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        const warnings: string[] = [];
        let skippedCount = 0;
        let unchangedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;

        const seenMasterNumbers = new Set<number>();
        const normalizedItems = items.map((item, index) => {
            const normalizedName = normalizeCoreProblemName(item.name);
            const videos = normalizeLectureVideos(item.lectureVideos);
            let skipReason: string | null = null;

            if (!Number.isInteger(item.masterNumber) || item.masterNumber <= 0) {
                skipReason = t('invalidMasterNumberRow', { row: index + 1 });
            } else if (!normalizedName) {
                skipReason = t('coreProblemNameRequiredRow', { row: index + 1 });
            } else if (seenMasterNumbers.has(item.masterNumber)) {
                skipReason = t('duplicateMasterNumberRow', { row: index + 1, masterNumber: item.masterNumber });
            }

            if (!skipReason) {
                seenMasterNumbers.add(item.masterNumber);
            }

            return {
                index,
                masterNumber: item.masterNumber,
                name: normalizedName,
                lectureVideos: videos,
                skipReason,
            };
        });

        for (const item of normalizedItems) {
            if (item.skipReason) {
                skippedCount += 1;
                warnings.push(item.skipReason);
            }
        }

        const validItems = normalizedItems.filter((item) => !item.skipReason);
        if (validItems.length === 0) {
            return {
                success: true,
                createdCount,
                updatedCount,
                unchangedCount,
                skippedCount,
                warnings,
            };
        }

        const existingCoreProblems = await prisma.coreProblem.findMany({
            where: { subjectId },
            select: {
                id: true,
                name: true,
                masterNumber: true,
                order: true,
                lectureVideos: true,
            },
        });

        const existingByMaster = new Map<number, (typeof existingCoreProblems)[number]>();
        const existingByName = new Map<string, (typeof existingCoreProblems)[number][]>();
        let maxOrder = 0;
        for (const coreProblem of existingCoreProblems) {
            existingByMaster.set(coreProblem.masterNumber, coreProblem);
            const key = normalizeCoreProblemName(coreProblem.name);
            const list = existingByName.get(key) || [];
            list.push(coreProblem);
            existingByName.set(key, list);
            maxOrder = Math.max(maxOrder, coreProblem.order);
        }

        const operations: Array<(tx: Prisma.TransactionClient) => Promise<unknown>> = [];
        const usedExistingIds = new Set<string>();

        for (const item of validItems) {
            const existingByMasterHit = existingByMaster.get(item.masterNumber);
            let target = existingByMasterHit;

            if (!target) {
                const byNameCandidates = (existingByName.get(item.name) || []).filter((cp) => !usedExistingIds.has(cp.id));
                if (byNameCandidates.length === 1) {
                    target = byNameCandidates[0];
                    warnings.push(t('assignedMasterNumberRow', { row: item.index + 1, masterNumber: item.masterNumber }));
                } else if (byNameCandidates.length > 1) {
                    skippedCount += 1;
                    warnings.push(t('ambiguousNameRow', { row: item.index + 1 }));
                    continue;
                }
            }

            if (!target) {
                maxOrder += 1;
                operations.push((tx) =>
                    tx.coreProblem.create({
                        data: {
                            subjectId,
                            name: item.name,
                            masterNumber: item.masterNumber,
                            order: maxOrder,
                            lectureVideos: toLectureVideosJson(item.lectureVideos),
                        },
                    })
                );
                createdCount += 1;
                continue;
            }

            usedExistingIds.add(target.id);
            const currentVideos = normalizeLectureVideos((target.lectureVideos as LectureVideo[] | null) || []);
            const isChanged =
                target.name !== item.name
                || target.masterNumber !== item.masterNumber
                || !areLectureVideosEqual(currentVideos, item.lectureVideos);

            if (!isChanged) {
                unchangedCount += 1;
                continue;
            }

            operations.push((tx) =>
                tx.coreProblem.update({
                    where: { id: target.id },
                    data: {
                        name: item.name,
                        masterNumber: item.masterNumber,
                        lectureVideos:
                            item.lectureVideos.length > 0
                                ? toLectureVideosJson(item.lectureVideos)
                                : Prisma.DbNull,
                    },
                })
            );
            updatedCount += 1;
        }

        if (operations.length > 0) {
            await prisma.$transaction(async (tx) => {
                for (const execute of operations) {
                    await execute(tx);
                }
                await resequenceCoreProblemsInTransaction(subjectId, tx);
            });
        }

        revalidateCurriculumPaths();
        return {
            success: true,
            createdCount,
            updatedCount,
            unchangedCount,
            skippedCount,
            warnings,
        };
    } catch (error) {
        console.error('Failed to bulk upsert core problems:', error);
        const uniqueMessage = extractUniqueConstraintMessage(error, t);
        if (uniqueMessage) {
            return { error: uniqueMessage };
        }
        return { error: t('bulkImportFailed') };
    }
}

export async function reorderCoreProblems(items: { id: string, order: number }[]) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        if (items.length === 0) {
            return { success: true };
        }

        const targets = await prisma.coreProblem.findMany({
            where: { id: { in: items.map((item) => item.id) } },
            select: { subjectId: true },
        });
        const subjectIds = Array.from(new Set(targets.map((target) => target.subjectId)));
        if (subjectIds.length !== 1) {
            return { error: t('sameSubjectOnly') };
        }
        const subjectId = subjectIds[0];

        await prisma.$transaction(async (tx) => {
            await bulkUpdateCoreProblemOrdersInTransaction(tx, items);
            await resequenceCoreProblemsInTransaction(subjectId, tx);
        });

        revalidateCurriculumPaths();
        return { success: true };
    } catch (error) {
        console.error('Failed to reorder core problems:', error);
        return { error: t('coreProblemReorderFailed') };
    }
}

// --- Problems ---
export async function getProblemsByCoreProblem(coreProblemId: string) {
    await requireProblemAuthor();
    const t = await getTranslations('AdminCurriculumActions');
    try {
        // Problem と CoreProblem は多対多のため、指定 CoreProblem に紐づく問題を取得する。
        const problems = await prisma.problem.findMany({
            where: {
                coreProblems: {
                    some: { id: coreProblemId }
                }
            },
            select: {
                id: true,
                customId: true,
                grade: true,
                masterNumber: true,
                videoUrl: true,
                publishedRevision: {
                    select: {
                        structuredContent: true,
                        correctAnswer: true,
                    },
                },
                // publishedRevision が無い DRAFT 問題用に最新リビジョンを 1 件取得し、
                // structuredContent / correctAnswer のフォールバックに使う。
                revisions: {
                    orderBy: { revisionNumber: 'desc' },
                    take: 1,
                    select: {
                        structuredContent: true,
                        correctAnswer: true,
                    },
                },
                coreProblems: {
                    select: {
                        id: true,
                        name: true,
                        subject: {
                            select: {
                                name: true,
                            },
                        },
                    },
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                },
            },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
        });
        return { success: true, problems };
    } catch (error) {
        console.error('Failed to fetch problems by core problem:', error);
        return { success: false, error: t('problemsLoadFailed') };
    }
}
