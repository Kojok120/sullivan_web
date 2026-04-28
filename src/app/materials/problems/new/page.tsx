import { getProblemEditorContext } from '@/app/admin/problems/actions';
import { ProblemAuthorEditorClient } from '../problem-author-editor-client';

export const dynamic = 'force-dynamic';

export default async function NewMaterialProblemPage({
    searchParams,
}: {
    searchParams: Promise<{ subjectId?: string }>;
}) {
    const [params, context] = await Promise.all([searchParams, getProblemEditorContext()]);
    const initialSubjectId = params.subjectId && context.subjects.some((subject) => subject.id === params.subjectId)
        ? params.subjectId
        : null;

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <ProblemAuthorEditorClient
                problem={null}
                subjects={context.subjects}
                coreProblems={context.coreProblems}
                routeBase="/materials/problems"
                initialSubjectId={initialSubjectId}
            />
        </div>
    );
}
