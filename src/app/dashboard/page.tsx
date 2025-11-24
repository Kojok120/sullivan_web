import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getStudentStats, getUnitProgress, getDailyActivity } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Trophy, Target, Clock } from 'lucide-react';
import { ActivityChart } from './activity-chart'; // We'll create this client component next

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const [stats, unitProgress, dailyActivity] = await Promise.all([
        getStudentStats(session.userId),
        getUnitProgress(session.userId),
        getDailyActivity(session.userId),
    ]);

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8">学習ダッシュボード</h1>

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

                {/* Unit Progress */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>単元別進捗</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {unitProgress.map((unit) => (
                                <div key={unit.unitId} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="font-medium">{unit.subjectName} - {unit.unitName}</div>
                                        <div className="text-muted-foreground">{unit.progressPercentage}%</div>
                                    </div>
                                    <Progress value={unit.progressPercentage} />
                                </div>
                            ))}
                            {unitProgress.length === 0 && (
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
