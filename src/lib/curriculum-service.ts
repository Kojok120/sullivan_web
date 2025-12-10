import { prisma } from '@/lib/prisma';

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
                    order: true,
                    createdAt: true,
                    updatedAt: true,
                }
            } : undefined
        }
    });
}

export async function getNextCustomId(subjectId: string, tx?: any): Promise<string> {
    const client = tx || prisma;
    const subject = await client.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new Error('Subject not found');

    let prefix = '';
    if (subject.name.includes('英語')) prefix = 'E';
    else if (subject.name.includes('国語')) prefix = 'J';
    else if (subject.name.includes('数学')) prefix = 'S';
    else prefix = subject.name.charAt(0).toUpperCase();

    // Use Raw SQL to find MAX number efficiently
    // "customId" format is "{prefix}-{number}"
    // We want MAX of the number part where customId starts with prefix + '-'

    // Postgres specific syntax:
    // SUBSTRING(customId FROM '^[A-Z]-([0-9]+)$') or similar.
    // Given known prefix, we can just match regex.
    // Or simplified: SUBSTRING(customId, LENGTH(prefix)+2) cast to int?
    // Let's use substring from length+2 (prefix + '-')
    // LENGTH('E-') is 2.

    // Note: Prisma raw query parameterization is important.
    // Since we are building string logic, we must be careful.
    // But prefix is derived from strict logic (E, J, S, or single char), so it's safe-ish from injection if just letters.
    // However, best to parameterize.

    const prefixDash = prefix + '-';
    const lengthPlusOne = prefixDash.length + 1; // SQL substring is 1-based usually?
    // Postgres usage: SUBSTRING(string FROM start)

    // Query: Get MAX of casted int
    const result = await client.$queryRaw`
        SELECT MAX(CAST(SUBSTRING("customId", ${lengthPlusOne}) AS INTEGER)) as max_num
        FROM "Problem"
        WHERE "customId" LIKE ${prefixDash + '%'}
    `;

    // result is [{ max_num: 10 }]
    let maxNum = 0;
    if (Array.isArray(result) && result.length > 0 && result[0].max_num !== null) {
        maxNum = Number(result[0].max_num);
    }

    return `${prefix}-${maxNum + 1}`;
}

// Deprecated wrapper for backward compatibility if widely used, 
// but we should aim to migrate to getNextCustomId.

