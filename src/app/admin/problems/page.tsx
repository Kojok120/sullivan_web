import { getProblems } from './actions';
import { ProblemManager } from './problem-manager';
import { getSubjects } from '../curriculum/actions';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string; subjectId?: string; sortBy?: string; sortOrder?: string; video?: string }>;
}) {
    // Next.js 15 以降では searchParams は Promise
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.q || '';
    const allowedSortKeys = ['masterNumber', 'customId', 'createdAt', 'updatedAt'] as const;
    const sortBy = allowedSortKeys.includes((params.sortBy ?? '') as typeof allowedSortKeys[number])
        ? (params.sortBy as typeof allowedSortKeys[number])
        : 'updatedAt';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const subjectsResult = await getSubjects();
    const subjects = subjectsResult.success && subjectsResult.subjects
        ? subjectsResult.subjects.map((subject: { id: string; name: string }) => ({
            id: subject.id,
            name: subject.name
        }))
        : [];

    // 初期データ取得
    const result = await getProblems(
        page,
        20,
        query,
        {
            grade: params.grade,
            coreProblemId: params.coreProblemId,
            subjectId: params.subjectId,
            video: params.video === 'exists' || params.video === 'none' ? params.video : undefined
        },
        sortBy,
        sortOrder
    );

    if (!result || 'error' in result) {
        return <div className="p-8 text-red-500">{result?.error || 'Unknown error'}</div>;
    }

    const { problems, total } = result;

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <h1 className="mb-6 text-2xl font-bold">問題管理</h1>
            <ProblemManager
                initialProblems={problems}
                totalCount={total || 0}
                currentPage={page}
                initialQuery={query}
                sortBy={sortBy}
                sortOrder={sortOrder}
                subjects={subjects}
            />
        </div>
    );
}
