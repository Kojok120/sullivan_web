import { getTranslations } from 'next-intl/server';
import { getSubjects } from '@/app/admin/curriculum/actions';

import { MaterialsCoreProblemManager } from './materials-core-problem-manager';

export const dynamic = 'force-dynamic';

export default async function MaterialsCoreProblemsPage() {
    const t = await getTranslations('MaterialsCoreProblemsPage');
    const { subjects, error } = await getSubjects();

    if (error || !subjects) {
        return (
            <div className="container mx-auto px-4 py-6 sm:py-8">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error || t('loadFailed')}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">{t('title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('description')}
                </p>
            </div>
            <MaterialsCoreProblemManager initialSubjects={subjects} />
        </div>
    );
}
