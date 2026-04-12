import { notFound } from 'next/navigation';

import { getProblemEditorContext } from '../actions';
import { ProblemEditorClient } from '../problem-editor-client';

export const dynamic = 'force-dynamic';

export default async function ProblemDetailPage({
    params,
}: {
    params: Promise<{ problemId: string }>;
}) {
    const { problemId } = await params;
    const context = await getProblemEditorContext(problemId);

    if (!context.problem) {
        notFound();
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <ProblemEditorClient
                problem={context.problem}
                subjects={context.subjects}
                coreProblems={context.coreProblems}
            />
        </div>
    );
}
