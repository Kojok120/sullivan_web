import { getProblems, getProblemSubjects } from './actions';
import { ProblemManager } from './problem-manager';
import { ProblemSubjectRequiredState } from './problem-subject-required-state';
import { isStructuredProblemsEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string; subjectId?: string; sortBy?: string; sortOrder?: string; video?: string; problemType?: string; contentFormat?: string; status?: string }>;
}) {
    // Next.js 15 以降では searchParams は Promise
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.q || '';
    const subjectId = params.subjectId;
    const allowedSortKeys = ['masterNumber', 'customId', 'createdAt', 'updatedAt'] as const;
    const sortBy = allowedSortKeys.includes((params.sortBy ?? '') as typeof allowedSortKeys[number])
        ? (params.sortBy as typeof allowedSortKeys[number])
        : 'updatedAt';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const subjectsResult = await getProblemSubjects();
    const subjects = subjectsResult.success && subjectsResult.subjects
        ? subjectsResult.subjects.map((subject: { id: string; name: string; coreProblems: { id: string; name: string }[] }) => ({
            id: subject.id,
            name: subject.name,
            coreProblems: subject.coreProblems,
        }))
        : [];

    const currentSubject = subjects.find((subject) => subject.id === subjectId) ?? null;

    if (!subjectId || !currentSubject) {
        return (
            <div className="container mx-auto px-4 py-6 sm:py-8">
                <h1 className="mb-6 text-2xl font-bold">問題一覧</h1>
                <ProblemSubjectRequiredState routeBase="/admin/problems" subjects={subjects} />
            </div>
        );
    }

    const result = await getProblems(
        page,
        20,
        query,
        {
            grade: params.grade,
            coreProblemId: params.coreProblemId,
            subjectId,
            video: params.video === 'exists' || params.video === 'none' ? params.video : undefined,
            problemType: params.problemType,
            contentFormat: params.contentFormat,
            status: params.status,
        },
        sortBy,
        sortOrder
    );

    if (!result || 'error' in result) {
        return <div className="p-8 text-red-500">{result?.error || 'Unknown error'}</div>;
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <h1 className="mb-6 text-2xl font-bold">{`問題一覧 - ${currentSubject.name}`}</h1>
            <ProblemManager
                initialProblems={result.problems}
                totalCount={result.total || 0}
                currentPage={page}
                initialQuery={query}
                sortBy={sortBy}
                sortOrder={sortOrder}
                subjects={subjects}
                currentSubject={currentSubject}
                structuredProblemsEnabled={isStructuredProblemsEnabled()}
            />
        </div>
    );
}
