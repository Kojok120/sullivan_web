import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getStudentStats, getSubjectProgress, getDailyActivity } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Trophy, Target } from 'lucide-react'; // Clock removed
import { ActivityChart } from './activity-chart';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { getUnwatchedCount } from "@/lib/analytics";

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const [stats, subjectProgress, dailyActivity, unwatchedCount] = await Promise.all([
        getStudentStats(session.userId),
        getSubjectProgress(session.userId),
        getDailyActivity(session.userId),
        getUnwatchedCount(session.userId)
    ]);

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8">学習ダッシュボード</h1>

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
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">連続学習</CardTitle>
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.currentStreak}日</div>
                        <p className="text-xs text-muted-foreground">継続は力なり！</p>
                    </CardContent>
                </Card>
            </div>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Activity Chart */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>学習アクティビティ (過去30日)</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ActivityChart data={dailyActivity} />
                    </CardContent>
                </Card>

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
                                        <div className="text-muted-foreground">{subject.progressPercentage}%</div>
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
