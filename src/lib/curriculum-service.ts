import { prisma } from '@/lib/prisma';
import { getSubjectPrefix } from '@/lib/subject-config';
import { Prisma } from '@prisma/client';

type CurriculumServiceClient = Pick<typeof prisma, 'subject' | 'problem' | '$queryRaw'>;

function shouldFallbackToCustomIdScan(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return error.code === 'P2010';
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const normalizedMessage = error.message.toLowerCase();
    return [
        'invalid input syntax',
        'syntax error',
        'cast',
        'operator does not exist',
        'function substring',
        'unrecognized token',
    ].some((token) => normalizedMessage.includes(token));
}

export async function fetchSubjects(options?: { includeCoreProblems?: boolean; packId?: string }) {
    const includeCoreProblems = options?.includeCoreProblems ?? false;
    const packId = options?.packId ?? 'jp-juken';

    return await prisma.subject.findMany({
        where: { packId },
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
    // PostgreSQL の関数で末尾番号を安全寄りに取得する
    // customId は {prefix}-{number} 形式を前提とする

    try {
        const lengthPlusOne = prefixDash.length + 1;
        const result = await client.$queryRaw<Array<{ max_num: number | string | bigint | null }>>`
            SELECT MAX(CAST(SUBSTRING("customId", ${lengthPlusOne}::integer) AS INTEGER)) as max_num
            FROM "Problem"
            WHERE "subjectId" = ${subjectId}
            AND "customId" LIKE ${prefixDash + '%'}
            -- 末尾が数値のみの customId に限定してキャストエラーを避ける
            AND "customId" ~ ${'^' + prefixDash + '[0-9]+$'}
        `;

        if (Array.isArray(result) && result.length > 0 && result[0].max_num !== null) {
            return Number(result[0].max_num);
        }
    } catch (e) {
        if (!shouldFallbackToCustomIdScan(e)) {
            throw e;
        }

        console.warn('最大 customId の高速取得に失敗したため、フォールバック処理へ切り替えます', e);
        // customId を全件取得して JavaScript 側で安全に最大値を求める
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
