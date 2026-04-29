import { notFound, redirect } from 'next/navigation';
import { getProblemSubjects, getProblems } from '@/app/admin/problems/actions';
import { ProblemManager } from '@/app/admin/problems/problem-manager';
import { buildProblemListUiPolicy, normalizeProblemSortBy } from '@/app/admin/problems/problem-list-policy';
import { isProblemStatusValue, isVideoStatusValue } from '@/lib/problem-ui';

export const dynamic = 'force-dynamic';

export default async function MaterialsProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string; subjectId?: string; sortBy?: string; sortOrder?: string; videoStatus?: string; problemType?: string; contentFormat?: string; status?: string }>;
}) {
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
        ? subjectsResult.subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            coreProblems: subject.coreProblems,
        }))
        : [];

    const currentSubject = subjects.find((subject) => subject.id === subjectId) ?? null;

    if (!subjectId || !currentSubject) {
        const defaultSubject = subjects[0];

        if (!defaultSubject) {
            notFound();
        }

        const nextParams = new URLSearchParams();
        nextParams.set('subjectId', defaultSubject.id);

        if (params.q) nextParams.set('q', params.q);
        if (params.grade) nextParams.set('grade', params.grade);
        if (params.sortBy && params.sortBy !== 'masterNumber') nextParams.set('sortBy', params.sortBy);
        if (params.sortBy && params.sortBy !== 'masterNumber' && params.sortOrder) nextParams.set('sortOrder', params.sortOrder);
        if (params.videoStatus) nextParams.set('videoStatus', params.videoStatus);
        if (params.problemType) nextParams.set('problemType', params.problemType);
        if (params.contentFormat) nextParams.set('contentFormat', params.contentFormat);
        if (params.status) nextParams.set('status', params.status);

        redirect(`/materials/problems?${nextParams.toString()}`);
    }

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
            contentFormat: params.contentFormat,
            status: isProblemStatusValue(params.status) ? params.status : undefined,
        },
        normalizeProblemSortBy(sortBy, currentSubject.name),
        sortOrder,
    );

    if (!result || 'error' in result) {
        return <div className="p-8 text-red-500">{result?.error || 'Unknown error'}</div>;
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">{`問題一覧 - ${currentSubject.name}`}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    問題の作成、修正、プレビューを行います。
                </p>
            </div>
            <ProblemManager
                initialProblems={result.problems}
                totalCount={result.total || 0}
                currentPage={page}
                initialQuery={query}
                sortBy={normalizeProblemSortBy(sortBy, currentSubject.name)}
                sortOrder={sortOrder}
                subjects={subjects}
                currentSubject={currentSubject}
                routeBase="/materials/problems"
                viewMode="author"
                showMasterNumber={buildProblemListUiPolicy(currentSubject, 'author').showMasterNumber}
                showBulkImport={buildProblemListUiPolicy(currentSubject, 'author').showBulkImport}
                bulkImportLabel={buildProblemListUiPolicy(currentSubject, 'author').bulkImportLabel}
                bulkImportConfig={buildProblemListUiPolicy(currentSubject, 'author').bulkImportConfig}
            />
        </div>
    );
}
