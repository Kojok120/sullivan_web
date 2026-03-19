import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, PlayCircle, Sparkles, Target, Trophy, Zap } from 'lucide-react';

import { getSession } from '@/lib/auth';
import { getDailyActivity, getStudentStats, getSubjectProgress, getUnwatchedCount, getUnwatchedLectures } from '@/lib/analytics';
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';
import { GoalReadonlyPanel } from '@/components/goals/goal-readonly-panel';
import { Heatmap } from '@/components/gamification/heatmap';
import { SubjectProgressList } from '@/components/subject-progress-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const [stats, subjectProgress, dailyActivity, unwatchedCount, unwatchedLectures, goalData] = await Promise.all([
        getStudentStats(session.userId),
        getSubjectProgress(session.userId),
        getDailyActivity(session.userId, 365),
        getUnwatchedCount(session.userId),
        getUnwatchedLectures(session.userId),
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
            <section className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] to-background p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold sm:text-3xl">学習ダッシュボード</h1>
                        <p className="mt-1 text-sm text-muted-foreground">今日やることを先に確認してから学習を始めましょう</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-background text-base">
                            Lv.{level}
                        </Badge>
                        <Badge variant="secondary">今日の目標 {todayGoalCount}件</Badge>
                    </div>
                </div>
                <div className="mt-4 w-full max-w-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>XP {currentXp}</span>
                        <span>Next {nextLevelXp}</span>
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

            {unwatchedCount > 0 || unwatchedLectures.length > 0 ? (
                <section className="grid gap-4 lg:grid-cols-2">
                    {unwatchedCount > 0 ? (
                        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>未視聴の解説動画があります</AlertTitle>
                            <AlertDescription className="mt-2 space-y-2">
                                <p>
                                    不正解問題のうち、まだ見ていない解説動画が <strong>{unwatchedCount}件</strong> あります。
                                </p>
                                <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold underline">
                                    ホームで復習を開始する
                                </Link>
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    {unwatchedLectures.length > 0 ? (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                            <PlayCircle className="h-4 w-4" />
                            <AlertTitle>先に講義動画の視聴が必要です</AlertTitle>
                            <AlertDescription className="mt-2">
                                <ul className="space-y-1">
                                    {unwatchedLectures.map((lecture) => (
                                        <li key={lecture.coreProblemId}>
                                            <Link href={`/unit-focus/${lecture.coreProblemId}`} className="inline-flex items-center gap-1 text-sm hover:underline">
                                                <span className="font-semibold">{lecture.subjectName}</span>
                                                <span>{lecture.coreProblemName}</span>
                                                <span>→</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </AlertDescription>
                        </Alert>
                    ) : null}
                </section>
            ) : null}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">総学習数</CardTitle>
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalProblemsSolved}問</div>
                        <p className="text-xs text-muted-foreground">これまでの累計</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">正答率</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.accuracy}%</div>
                        <p className="text-xs text-muted-foreground">平均正答率</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50/70">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-blue-800">連続学習</CardTitle>
                        <Zap className="h-4 w-4 fill-blue-500 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">{stats.currentStreak}日</div>
                        <p className="text-xs text-blue-700">連続達成中</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">レベル</CardTitle>
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Lv.{level}</div>
                        <p className="text-xs text-muted-foreground">次レベルまで {Math.max(0, nextLevelXp - currentXp)} XP</p>
                    </CardContent>
                </Card>
            </section>

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
        </div>
    );
}
