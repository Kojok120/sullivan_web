import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getStudentStats, getUnitProgress, getDailyActivity } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ActivityChart } from '@/app/dashboard/activity-chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface PageProps {
    params: Promise<{
        userId: string;
    }>;
}

export default async function StudentAnalyticsPage({ params }: PageProps) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');

    const { userId } = await params;

    const student = await prisma.user.findUnique({
        where: { id: userId },
        include: { group: true },
    });

    if (!student) return <div>生徒が見つかりません</div>;

    let stats, unitProgress, dailyActivity, recentHistory;
    try {
        [stats, unitProgress, dailyActivity, recentHistory] = await Promise.all([
            getStudentStats(student.id),
            getUnitProgress(student.id),
            getDailyActivity(student.id),
            prisma.learningHistory.findMany({
                where: { userId: student.id },
                orderBy: { answeredAt: 'desc' },
                take: 50,
                include: {
                    problem: {
                        include: {
                            coreProblem: {
                                include: { unit: { include: { subject: true } } }
                            }
                        }
                    }
                }
            })
        ]);
    } catch (error) {
        console.error("Error fetching analytics data:", error);
        throw error;
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">{student.name || student.loginId} の学習状況</h1>
                <p className="text-muted-foreground">
                    {student.group?.name || 'グループなし'} | {student.role}
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">総回答数</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalProblemsSolved}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">正答率</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.accuracy}%</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">連続学習</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.currentStreak}日</div></CardContent>
                </Card>

            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mb-8">
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
                        <div className="space-y-6 max-h-[350px] overflow-y-auto pr-2">
                            {unitProgress.map((unit) => (
                                <div key={unit.unitId} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="font-medium">{unit.subjectName} - {unit.unitName}</div>
                                        <div className="text-muted-foreground">{unit.progressPercentage}%</div>
                                    </div>
                                    <Progress value={unit.progressPercentage} />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent History Log */}
            <Card>
                <CardHeader>
                    <CardTitle>最近の学習履歴 (最新50件)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>日時</TableHead>
                                <TableHead>科目/単元</TableHead>
                                <TableHead>問題</TableHead>
                                <TableHead>評価</TableHead>
                                <TableHead>AI採点</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentHistory.map((history) => (
                                <TableRow key={history.id}>
                                    <TableCell className="whitespace-nowrap">
                                        {new Date(history.answeredAt).toLocaleString('ja-JP')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm font-medium">{history.problem.coreProblem.unit.subject.name}</div>
                                        <div className="text-xs text-muted-foreground">{history.problem.coreProblem.unit.name}</div>
                                    </TableCell>
                                    <TableCell className="max-w-[300px] truncate" title={history.problem.question}>
                                        {history.problem.question}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={['A', 'B'].includes(history.evaluation) ? 'default' : 'destructive'}>
                                            {history.evaluation}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {history.problem.aiGradingEnabled ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-medium">回答: {history.userAnswer || '-'}</span>
                                                {history.feedback && (
                                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={history.feedback}>
                                                        FB: {history.feedback}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
