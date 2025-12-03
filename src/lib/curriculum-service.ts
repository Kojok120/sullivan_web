import { prisma } from '@/lib/prisma';

export async function fetchSubjects(options?: { includeUnits?: boolean; includeCoreProblems?: boolean }) {
    const includeUnits = options?.includeUnits ?? false;
    const includeCoreProblems = options?.includeCoreProblems ?? false;

    return await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        include: includeUnits ? {
            units: {
                orderBy: { order: 'asc' },
                include: {
                    subject: true,
                    coreProblems: includeCoreProblems ? {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            name: true,
                            unitId: true,
                            order: true,
                            createdAt: true,
                            updatedAt: true,
                            // Explicitly excluding description and sharedVideoUrl by not selecting them
                        }
                    } : undefined
                }
            }
        } : undefined
    });
}
