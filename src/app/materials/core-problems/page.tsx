import { notFound } from 'next/navigation';

import { getSubjects } from '@/app/admin/curriculum/actions';
import { isStructuredProblemsEnabled } from '@/lib/feature-flags';

import { MaterialsCoreProblemManager } from './materials-core-problem-manager';

export const dynamic = 'force-dynamic';

export default async function MaterialsCoreProblemsPage() {
    if (!isStructuredProblemsEnabled()) {
        notFound();
    }

    const { subjects, error } = await getSubjects();

    if (error || !subjects) {
        return (
            <div className="container mx-auto px-4 py-6 sm:py-8">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error || 'CoreProblemの取得に失敗しました'}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">CoreProblem管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    科目ごとの CoreProblem を作成・編集・並び替えします。
                </p>
            </div>
            <MaterialsCoreProblemManager initialSubjects={subjects} />
        </div>
    );
}
