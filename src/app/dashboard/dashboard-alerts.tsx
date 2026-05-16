import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, PlayCircle } from 'lucide-react';

import { getUnwatchedCount, getUnwatchedLectures } from '@/lib/analytics';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// 上部アラート（未視聴解説動画 + 未視聴講義動画）。Suspense 境界の内側で fetch され
// 上部 KPI / 目標パネルの初回描画をブロックしないようにする。
export async function DashboardAlerts({ userId }: { userId: string }) {
    const [unwatchedCount, unwatchedLectures, t] = await Promise.all([
        getUnwatchedCount(userId),
        getUnwatchedLectures(userId),
        getTranslations('DashboardAlerts'),
    ]);

    if (unwatchedCount === 0 && unwatchedLectures.length === 0) {
        return null;
    }

    return (
        <section className="grid gap-4 lg:grid-cols-2">
            {unwatchedCount > 0 ? (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('unwatchedReviewTitle')}</AlertTitle>
                    <AlertDescription className="mt-2 space-y-2">
                        <p>
                            {t('unwatchedReviewDescriptionBefore')} <strong>{t('unwatchedReviewCount', { count: unwatchedCount })}</strong> {t('unwatchedReviewDescriptionAfter')}
                        </p>
                        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold underline">
                            {t('startReviewFromHome')}
                        </Link>
                    </AlertDescription>
                </Alert>
            ) : null}

            {unwatchedLectures.length > 0 ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                    <PlayCircle className="h-4 w-4" />
                    <AlertTitle>{t('lectureRequiredTitle')}</AlertTitle>
                    <AlertDescription className="mt-2">
                        <ul className="space-y-1">
                            {unwatchedLectures.map((lecture) => (
                                <li key={lecture.coreProblemId}>
                                    <Link href={`/unit-focus/${lecture.coreProblemId}`} className="inline-flex items-center gap-1 text-sm hover:underline">
                                        <span className="font-semibold">{lecture.subjectName}</span>
                                        <span>{lecture.coreProblemName}</span>
                                        <span>{t('lectureLinkSeparator')}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            ) : null}
        </section>
    );
}
