export const dynamic = 'force-dynamic';

import { getTranslations } from 'next-intl/server';
import { getSubjects } from './actions';
import { CurriculumManager } from './curriculum-manager';

export default async function CurriculumPage() {
    const t = await getTranslations('AdminCurriculumPage');
    const { subjects, error } = await getSubjects();

    if (error || !subjects) {
        return (
            <div className="p-8 text-center text-red-600">
                {t('error', { message: error || t('loadFailed') })}
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-10">
            <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">{t('title')}</h1>
            <p className="mb-6 text-sm text-muted-foreground sm:text-base">
                {t('description')}
            </p>
            <CurriculumManager initialSubjects={subjects} />
        </div>
    );
}
