import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getStudentStats, getSubjectProgress, getDailyActivity, getUnwatchedCount } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Trophy, Target, Printer, AlertTriangle, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ActivityChart } from './activity-chart';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Heatmap } from '@/components/gamification/heatmap';
import { Badge } from '@/components/ui/badge';

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const [stats, subjectProgress, dailyActivity, unwatchedCount] = await Promise.all([
        getStudentStats(session.userId),
        getSubjectProgress(session.userId),
        getDailyActivity(session.userId, 365), // Fetch 1 year for heatmap
        getUnwatchedCount(session.userId)
    ]);

    // Calculate XP Progress
    const level = stats.level || 1;
    const currentXp = stats.xp || 0;
    const prevLevelXp = 100 * Math.pow(level, 2);
    const nextLevelXp = 100 * Math.pow(level + 1, 2);
    const progressPercent = Math.min(100, Math.max(0, ((currentXp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100));

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold">学習ダッシュボード</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-lg py-1 px-3 border-yellow-500 text-yellow-700 bg-yellow-50">
                            Lv.{level}
                        </Badge>
                        <div className="flex flex-col w-48 gap-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>XP {currentXp}</span>
                                <span>Next {nextLevelXp}</span>
                            </div>
                            <Progress value={progressPercent} className="h-2" />
                        </div>
                    </div>
                </div>
                {/* Achievements link removed as per request to separate them */}
            </div>

            {/* Unwatched Video Alert */}
            {unwatchedCount > 0 && (
                <div className="mb-8">
                    <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>未視聴の動画があります</AlertTitle>
                        <AlertDescription className="mt-2 flex items-center justify-between">
                            <span>
                                不正解の問題で、まだ解説動画を見ていないものが {unwatchedCount} 件あります。
                                <br />学習履歴から確認して、復習を行いましょう。
                            </span>
                            <Link href="/">
                                <span className="underline font-bold cursor-pointer">
                                    ホームへ移動する
                                </span>
                            </Link>
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">総学習数</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalProblemsSolved}問</div>
                        <p className="text-xs text-muted-foreground">これまでの合計</p>
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
                <Card className="border-blue-200 bg-blue-50/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">連続学習</CardTitle>
                        <Zap className="h-4 w-4 text-blue-500 fill-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">{stats.currentStreak}日</div>
                        <p className="text-xs text-blue-600 font-medium">毎日続けて偉い！</p>
                    </CardContent>
                </Card>
            </div>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Activity Heatmap */}
                <div className="col-span-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>学習アクティビティ (直近)</CardTitle>
                        </CardHeader>
                        <CardContent className="pl-2">
                            <ActivityChart data={dailyActivity.slice(-30)} />
                        </CardContent>
                    </Card>
                    <Heatmap data={dailyActivity} />
                </div>

                {/* Subject Progress */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>教科別進捗</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {subjectProgress.map((subject) => (
                                <div key={subject.subjectId} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="font-medium">{subject.subjectName}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-muted-foreground">{subject.progressPercentage}%</div>
                                            <Link href={`/dashboard/print?subjectId=${subject.subjectId}`} title="問題を印刷">
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <Printer className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <Progress value={subject.progressPercentage} />
                                </div>
                            ))}
                            {subjectProgress.length === 0 && (
                                <div className="text-sm text-muted-foreground text-center py-4">
                                    まだ学習データがありません
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
