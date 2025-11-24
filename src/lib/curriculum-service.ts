import { prisma } from '@/lib/prisma';

export async function fetchSubjects(options?: { includeUnits?: boolean; includeCoreProblems?: boolean }) {
    const includeUnits = options?.includeUnits ?? false;
    const includeCoreProblems = options?.includeCoreProblems ?? false;

    return await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        include: includeUnits ? {
            units: {
                orderBy: { order: 'asc' },
                include: includeCoreProblems ? {
                    coreProblems: {
                        orderBy: { order: 'asc' },
                    }
                } : undefined
            }
        } : undefined
    });
}
