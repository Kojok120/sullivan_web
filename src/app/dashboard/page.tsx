import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getStudentStats, getSubjectProgress, getDailyActivity } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Trophy, Target, Clock } from 'lucide-react';
import { ActivityChart } from './activity-chart'; // We'll create this client component next

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const [stats, subjectProgress, dailyActivity] = await Promise.all([
        getStudentStats(session.userId),
        getSubjectProgress(session.userId),
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

            {/* Recent Feedback Section */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">最新のフィードバック</h2>
                    <Link href="/dashboard/history" className="text-sm text-blue-600 hover:underline">
                        全ての履歴を見る
                    </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <RecentFeedbackList userId={session.userId} />
                </div>
            </div>
        </div>
    );
}

import Link from 'next/link';
import { getLearningHistory } from '@/lib/analytics';

async function RecentFeedbackList({ userId }: { userId: string }) {
    const { items } = await getLearningHistory(userId, 1, 3); // Get top 3 for cards

    if (items.length === 0) {
        return <div className="text-sm text-gray-500">まだ履歴がありません</div>;
    }

    return (
        <>
            {items.map((item) => (
                <Card key={item.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-base font-semibold line-clamp-1" title={item.problem.question}>
                                {item.problem.question}
                            </CardTitle>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold
                                ${item.evaluation === 'A' ? 'bg-green-100 text-green-800' :
                                    item.evaluation === 'B' ? 'bg-blue-100 text-blue-800' :
                                        item.evaluation === 'C' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'}`}>
                                {item.evaluation}
                            </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {item.problem.coreProblems[0]?.subject.name} &bull; {item.answeredAt.toLocaleDateString('ja-JP')}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <p className="text-sm text-gray-600 line-clamp-3">
                            {item.feedback || 'フィードバックなし'}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </>
    );
}
