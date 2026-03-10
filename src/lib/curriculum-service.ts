import { prisma } from '@/lib/prisma';
import { getSubjectPrefix } from '@/lib/subject-config';

type CurriculumServiceClient = Pick<typeof prisma, 'subject' | 'problem' | '$queryRaw'>;

export async function fetchSubjects(options?: { includeCoreProblems?: boolean }) {
    const includeCoreProblems = options?.includeCoreProblems ?? false;

    return await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        include: {
            coreProblems: includeCoreProblems ? {
                orderBy: { order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    masterNumber: true,
                    order: true,
                    createdAt: true,
                    updatedAt: true,
                    subjectId: true,
                    lectureVideos: true,
                }
            } : undefined
        }
    });
}


async function getMaxCustomIdNumber(
    prefix: string,
    subjectId: string,
    client: CurriculumServiceClient = prisma
): Promise<number> {
    const prefixDash = prefix + '-';
    // Postgres specific syntax to find max number safely-ish
    // We assume the format is strictly {prefix}-{number}
    // Using simple substring might fail if we have "E-10-A" but we assume validation elsewhere.

    try {
        const lengthPlusOne = prefixDash.length + 1;
        const result = await client.$queryRaw<Array<{ max_num: number | string | bigint | null }>>`
            SELECT MAX(CAST(SUBSTRING("customId", ${lengthPlusOne}::integer) AS INTEGER)) as max_num
            FROM "Problem"
            WHERE "subjectId" = ${subjectId}
            AND "customId" LIKE ${prefixDash + '%'}
            -- Ensure we only pick ones that look like number at the end to avoid casting errors
            AND "customId" ~ ${'^' + prefixDash + '[0-9]+$'}
        `;

        if (Array.isArray(result) && result.length > 0 && result[0].max_num !== null) {
            return Number(result[0].max_num);
        }
    } catch (e) {
        console.warn('Optimized Max ID query failed, falling back to safe slow method', e);
        // Fallback: Fetch all and parse in JS (safe slow method)
        // This is necessary if someone manually inserted "E-NaN" or strict mode issues
        const all = await client.problem.findMany({
            where: {
                subjectId,
                customId: { startsWith: prefixDash }
            },
            select: { customId: true }
        });

        let max = 0;
        for (const p of all) {
            if (!p.customId) continue;
            const parts = p.customId.split('-');
            if (parts.length === 2) {
                const num = parseInt(parts[1], 10);
                if (!isNaN(num) && num > max) max = num;
            }
        }
        return max;
    }

    return 0;
}

export async function getNextCustomId(subjectId: string, tx?: CurriculumServiceClient): Promise<string> {
    const client = tx || prisma;
    const subject = await client.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new Error('Subject not found');

    const prefix = getSubjectPrefix(subject.name);
    const maxNum = await getMaxCustomIdNumber(prefix, subjectId, client);

    return `${prefix}-${maxNum + 1}`;
}

/**
 * バッチ対応版: 複数のカスタムIDを一度に生成 (N+1問題解消用)
 */
export async function getNextCustomIds(
    subjectId: string,
    count: number,
    tx?: CurriculumServiceClient
): Promise<string[]> {
    const client = tx || prisma;
    const subject = await client.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new Error('Subject not found');

    const prefix = getSubjectPrefix(subject.name);
    const maxNum = await getMaxCustomIdNumber(prefix, subjectId, client);

    return Array.from({ length: count }, (_, i) => `${prefix}-${maxNum + i + 1}`);
}

// Deprecated wrapper for backward compatibility if widely used, 
// but we should aim to migrate to getNextCustomId.
