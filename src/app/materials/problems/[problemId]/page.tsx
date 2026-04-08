import { notFound } from 'next/navigation';

import { getProblemEditorContext } from '@/app/admin/problems/actions';
import { isStructuredProblemsEnabled } from '@/lib/feature-flags';
import { ProblemAuthorEditorClient } from '../problem-author-editor-client';

export const dynamic = 'force-dynamic';

export default async function MaterialProblemDetailPage({
    params,
}: {
    params: Promise<{ problemId: string }>;
}) {
    if (!isStructuredProblemsEnabled()) {
        notFound();
    }

    const { problemId } = await params;
    const context = await getProblemEditorContext(problemId);

    if (!context.problem) {
        notFound();
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <ProblemAuthorEditorClient
                problem={context.problem}
                subjects={context.subjects}
                coreProblems={context.coreProblems}
                routeBase="/materials/problems"
            />
        </div>
    );
}
