import { Suspense } from 'react';
import { getProblems } from './actions';
import { ProblemManager } from './problem-manager';
import { getSubjects } from '../curriculum/actions';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string; subjectId?: string; sortBy?: string; sortOrder?: string; video?: string }>;
}) {
    // In Next.js 15+, searchParams is a Promise
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.q || '';
    const sortBy = params.sortBy === 'customId' || params.sortBy === 'createdAt' || params.sortBy === 'updatedAt'
        ? params.sortBy
        : 'updatedAt';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const subjectsResult = await getSubjects();
    const subjects = subjectsResult.success && subjectsResult.subjects
        ? subjectsResult.subjects.map((subject: { id: string; name: string }) => ({
            id: subject.id,
            name: subject.name
        }))
        : [];

    // Initial data fetch
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
        <div className="container mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6">問題管理</h1>
            <Suspense fallback={<div>Loading...</div>}>
                <ProblemManager
                    initialProblems={problems}
                    totalCount={total || 0}
                    currentPage={page}
                    initialQuery={query}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    subjects={subjects}
                />
            </Suspense>
        </div>
    );
}
