import { getDailyActivity, getSubjectProgress } from '@/lib/analytics';
import { Heatmap } from '@/components/gamification/heatmap';
import { SubjectProgressList } from '@/components/subject-progress-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ヒートマップ + 教科別進捗。dailyActivity は 365 日分とサイズが大きいので、
// このセクションだけ Suspense 境界で stream し、上部 KPI の初回描画を妨げない。
export async function DashboardHeatmapSection({ userId }: { userId: string }) {
    const [dailyActivity, subjectProgress] = await Promise.all([
        getDailyActivity(userId, 365),
        getSubjectProgress(userId),
    ]);

    return (
        <section className="grid gap-4 lg:grid-cols-12">
            <Card className="min-w-0 lg:col-span-8">
                <CardHeader className="px-4 pb-3 sm:px-6">
                    <CardTitle>学習ヒートマップ</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-6">
                    <div className="sm:hidden">
                        <Heatmap data={dailyActivity} days={90} />
                    </div>
                    <div className="hidden sm:block">
                        <Heatmap data={dailyActivity} />
                    </div>
                </CardContent>
            </Card>

            <div className="min-w-0 space-y-4 lg:col-span-4">
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle>教科別進捗</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-5 sm:px-6">
                        <SubjectProgressList items={subjectProgress} />
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}

// Heatmap セクションのフォールバック。CLS を抑えるため概ね同じ高さの skeleton を出す。
export function DashboardHeatmapSectionFallback() {
    return (
        <section className="grid gap-4 lg:grid-cols-12">
            <Card className="min-w-0 lg:col-span-8">
                <CardHeader className="px-4 pb-3 sm:px-6">
                    <CardTitle>学習ヒートマップ</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-6">
                    <div className="h-[150px] w-full animate-pulse rounded bg-muted" />
                </CardContent>
            </Card>
            <div className="min-w-0 space-y-4 lg:col-span-4">
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle>教科別進捗</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-5 sm:px-6">
                        <div className="h-[150px] w-full animate-pulse rounded bg-muted" />
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}
