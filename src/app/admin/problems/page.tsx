import { isProblemStatusValue, isVideoStatusValue } from '@/lib/problem-ui';

import { getProblems, getProblemSubjects } from './actions';
import { ProblemManager } from './problem-manager';
import { buildProblemListUiPolicy, normalizeProblemSortBy } from './problem-list-policy';
import { ProblemSubjectRequiredState } from './problem-subject-required-state';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string; subjectId?: string; sortBy?: string; sortOrder?: string; videoStatus?: string; problemType?: string; status?: string }>;
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
        ? subjectsResult.subjects.map((subject: { id: string; name: string; coreProblems: { id: string; name: string; masterNumber?: number | null }[] }) => ({
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

    const normalizedSortBy = normalizeProblemSortBy(sortBy, currentSubject.name);
    const policy = buildProblemListUiPolicy(currentSubject, 'admin');

    const result = await getProblems(
        page,
        20,
        query,
        {
            grade: params.grade,
            coreProblemId: params.coreProblemId,
            subjectId,
            videoStatus: isVideoStatusValue(params.videoStatus) ? params.videoStatus : undefined,
            problemType: params.problemType,
            status: isProblemStatusValue(params.status) ? params.status : undefined,
        },
        normalizedSortBy,
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
                sortBy={normalizedSortBy}
                sortOrder={sortOrder}
                subjects={subjects}
                currentSubject={currentSubject}
                showMasterNumber={policy.showMasterNumber}
                showBulkImport={policy.showBulkImport}
                bulkImportLabel={policy.bulkImportLabel}
                bulkImportConfig={policy.bulkImportConfig}
            />
        </div>
    );
}
