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

export async function generateCustomId(subjectId: string, offset: number = 0): Promise<string> {
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new Error('Subject not found');

    let prefix = '';
    if (subject.name.includes('英語')) prefix = 'E';
    else if (subject.name.includes('国語')) prefix = 'J';
    else if (subject.name.includes('数学')) prefix = 'S';
    else prefix = subject.name.charAt(0).toUpperCase();

    // Count existing problems
    const count = await prisma.problem.count({
        where: {
            coreProblems: {
                some: {
                    subjectId: subject.id
                }
            }
        }
    });

    return `${prefix}-${count + 1 + offset}`;
}
