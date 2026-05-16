import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Sparkles, Target, Trophy, Zap } from 'lucide-react';

import { getSession } from '@/lib/auth';
import { getStudentStats } from '@/lib/analytics';
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';
import { GoalReadonlyPanel } from '@/components/goals/goal-readonly-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { DashboardAlerts } from './dashboard-alerts';
import { DashboardHeatmapSection, DashboardHeatmapSectionFallback } from './dashboard-heatmap-section';

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    const [t, heatmapT] = await Promise.all([
        getTranslations('Dashboard'),
        getTranslations('DashboardHeatmap'),
    ]);
    const heatmapTitles = {
        heatmapTitle: heatmapT('heatmapTitle'),
        subjectProgressTitle: heatmapT('subjectProgressTitle'),
    };

    // 上部 KPI と目標パネルは初回描画に必要なので同期取得する。
    // 重い fetch（heatmap = dailyActivity 365日分 + 教科別進捗）と、
    // 緊急度の低い fetch（未視聴アラート）は Suspense で stream する。
    const [stats, goalData] = await Promise.all([
        getStudentStats(session.userId),
        getGoalDailyViewPayload({ studentId: session.userId }),
    ]);

    const level = stats.level || 1;
    const currentXp = stats.xp || 0;
    const prevLevelXp = 100 * Math.pow(level, 2);
    const nextLevelXp = 100 * Math.pow(level + 1, 2);
    const progressPercent = Math.min(100, Math.max(0, ((currentXp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100));

    const todayGoalCount = goalData.rows.find((row) => row.dateKey === goalData.todayKey)?.entries.length ?? 0;

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
            <section className="rounded-lg border border-primary/25 bg-accent p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-background text-base">
                            {t('levelBadge', { level })}
                        </Badge>
                        <Badge variant="secondary">{t('todayGoalCount', { count: todayGoalCount })}</Badge>
                    </div>
                </div>
                <div className="mt-4 w-full max-w-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('currentXp', { xp: currentXp })}</span>
                        <span>{t('nextXp', { xp: nextLevelXp })}</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                </div>
            </section>

            <section className="space-y-4">
                <GoalReadonlyPanel
                    studentId={session.userId}
                    initialData={goalData}
                    showTimeline
                />
            </section>

            <Suspense fallback={null}>
                <DashboardAlerts userId={session.userId} />
            </Suspense>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('totalProblemsTitle')}</CardTitle>
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{t('problemCount', { count: stats.totalProblemsSolved })}</div>
                        <p className="text-xs text-muted-foreground">{t('totalProblemsDescription')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('accuracyTitle')}</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.accuracy}%</div>
                        <p className="text-xs text-muted-foreground">{t('accuracyDescription')}</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50/70">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-blue-800">{t('streakTitle')}</CardTitle>
                        <Zap className="h-4 w-4 fill-blue-500 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">{t('streakDays', { days: stats.currentStreak })}</div>
                        <p className="text-xs text-blue-700">{t('streakDescription')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('levelTitle')}</CardTitle>
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{t('levelBadge', { level })}</div>
                        <p className="text-xs text-muted-foreground">{t('nextLevelXp', { xp: Math.max(0, nextLevelXp - currentXp) })}</p>
                    </CardContent>
                </Card>
            </section>

            <Suspense fallback={<DashboardHeatmapSectionFallback titles={heatmapTitles} />}>
                <DashboardHeatmapSection userId={session.userId} />
            </Suspense>
        </div>
    );
}
