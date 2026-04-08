import type { Prisma, ProblemAsset, ProblemRevision } from '@prisma/client';

export const problemRevisionInclude = {
    assets: true,
} satisfies Prisma.ProblemRevisionInclude;

export const problemAdminInclude = {
    subject: true,
    coreProblems: {
        include: {
            subject: true,
        },
    },
    publishedRevision: {
        include: problemRevisionInclude,
    },
    revisions: {
        include: problemRevisionInclude,
        orderBy: {
            revisionNumber: 'desc',
        },
    },
} satisfies Prisma.ProblemInclude;

export const problemAuditInclude = {
    problem: {
        select: {
            id: true,
            customId: true,
            question: true,
        },
    },
} satisfies Prisma.ProblemGradingAuditInclude;

export type ProblemWithRelations = Prisma.ProblemGetPayload<{
    include: typeof problemAdminInclude;
}>;

export type ProblemGradingAuditWithProblem = Prisma.ProblemGradingAuditGetPayload<{
    include: typeof problemAuditInclude;
}>;

export type RenderableProblemAsset = ProblemAsset & {
    signedUrl?: string | null;
};

export type RenderableProblemRevision = Omit<ProblemRevision, 'assets'> & {
    assets: RenderableProblemAsset[];
};

export type RenderableProblemWithRelations = Omit<ProblemWithRelations, 'publishedRevision' | 'revisions'> & {
    publishedRevision: RenderableProblemRevision | null;
    revisions: RenderableProblemRevision[];
};
