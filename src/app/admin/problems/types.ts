import type { Prisma } from '@prisma/client';

export type ProblemWithRelations = Prisma.ProblemGetPayload<{
    include: {
        coreProblems: {
            include: {
                subject: true;
            };
        };
    };
}>;
