import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

type ProblemSubjectRequiredStateProps = {
    routeBase: string;
    subjects: {
        id: string;
        name: string;
    }[];
};

export async function ProblemSubjectRequiredState({
    routeBase,
    subjects,
}: ProblemSubjectRequiredStateProps) {
    const t = await getTranslations('ProblemSubjectRequiredState');

    return (
        <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">{t('title')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
                {t('description')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                {subjects.map((subject) => (
                    <Button key={subject.id} asChild variant="outline">
                        <Link href={`${routeBase}?subjectId=${subject.id}`}>
                            {t('subjectLink', { subjectName: subject.name })}
                        </Link>
                    </Button>
                ))}
            </div>
        </div>
    );
}
