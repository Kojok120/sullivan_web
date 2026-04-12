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

export type ProblemWithRelations = Prisma.ProblemGetPayload<{
    include: typeof problemAdminInclude;
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
