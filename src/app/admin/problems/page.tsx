import { Suspense } from 'react';
import { getProblems, searchCoreProblems } from './actions';
import { ProblemManager } from './problem-manager';
import { getSubjects } from '../curriculum/actions';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; grade?: string; coreProblemId?: string }>;
}) {
    // In Next.js 15+, searchParams is a Promise
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.q || '';

    // Initial data fetch
    const { problems, total, error } = await getProblems(page, 20, query, {
        grade: params.grade,
        coreProblemId: params.coreProblemId
    });

    if (error) {
        return <div className="p-8 text-red-500">{error}</div>;
    }

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6">問題管理</h1>
            <Suspense fallback={<div>Loading...</div>}>
                <ProblemManager
                    initialProblems={problems || []}
                    totalCount={total || 0}
                    currentPage={page}
                    initialQuery={query}
                />
            </Suspense>
        </div>
    );
}

