import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Clock, Target, Trophy, Activity } from 'lucide-react';
import { getStudentStats, getUnitProgress, getDailyActivity, getStudentWeaknesses } from '@/lib/analytics';
import { ActivityChart } from '@/app/dashboard/activity-chart';
import { ProfileCard } from './profile-card';
import { GuidanceList } from './guidance-list';

export default async function TeacherStudentDetailPage({
    params,
}: {
    params: { userId: string };
}) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) redirect('/login');

    const { userId } = await params;

    const [student, stats, unitProgress, dailyActivity, weaknesses, recentHistory, classrooms] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            include: {
                group: true,
                guidanceRecords: {
                    include: { teacher: { select: { name: true } } },
                    orderBy: { date: 'desc' }
                }
            },
        }),
        getStudentStats(userId),
        getUnitProgress(userId),
        getDailyActivity(userId),
        getStudentWeaknesses(userId),
        prisma.learningHistory.findMany({
            where: { userId },
            take: 50,
            orderBy: { answeredAt: 'desc' },
            include: {
                problem: {
                    include: {
                        coreProblem: {
                            include: { unit: true }
                        }
                    }
                }
            }
        }),
        prisma.classroom.findMany({
            orderBy: { createdAt: 'asc' }
        })
    ]);

    if (!student) {
        return (
            <div className="container mx-auto py-8 px-4 text-center">
                <h1 className="text-2xl font-bold">生徒が見つかりません</h1>
                <Button asChild className="mt-4">
                    <Link href="/teacher">一覧に戻る</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/teacher">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        {student.name || student.loginId}
                        {student.group && <Badge variant="outline">{student.group.name}</Badge>}
                    </h1>
                    <p className="text-muted-foreground">生徒詳細データ</p>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">学習状況</TabsTrigger>
                    <TabsTrigger value="history">学習履歴ログ</TabsTrigger>
                    <TabsTrigger value="profile">生徒情報</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    {/* Overview Stats */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">総回答数</CardTitle>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.totalProblemsSolved}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">正答率</CardTitle>
                                <Target className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${stats.accuracy < 50 ? 'text-red-500' : 'text-green-600'}`}>
                                    {stats.accuracy}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    正解数: {stats.totalCorrect}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">連続学習</CardTitle>
                                <Trophy className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.currentStreak}日</div>
                                <p className="text-xs text-muted-foreground">
                                    継続は力なり
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">最終学習</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString() : '-'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {stats.lastActivity ? new Date(stats.lastActivity).toLocaleTimeString() : ''}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-7">
                        {/* Weakness Analysis */}
                        <Card className="md:col-span-3">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                                    弱点分析 (正答率ワースト)
                                </CardTitle>
                                <CardDescription>
                                    正答率が低く、重点的な復習が必要な単元
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {weaknesses.length > 0 ? (
                                        weaknesses.map((w) => (
                                            <div key={w.coreProblemId} className="flex items-center justify-between border-b pb-2 last:border-0">
                                                <div className="space-y-1">
                                                    <p className="font-medium text-sm">{w.coreProblemName}</p>
                                                    <p className="text-xs text-muted-foreground">{w.unitName}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-red-500 font-bold text-lg">{w.accuracy}%</span>
                                                    <p className="text-xs text-muted-foreground">{w.totalAttempts}回実施</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            顕著な弱点は見つかりませんでした
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Activity Chart */}
                        <Card className="md:col-span-4">
                            <CardHeader>
                                <CardTitle>学習活動 (過去30日)</CardTitle>
                            </CardHeader>
                            <CardContent className="pl-2">
                                <ActivityChart data={dailyActivity} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Unit Progress */}
                    <Card>
                        <CardHeader>
                            <CardTitle>単元別進捗状況</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {unitProgress.map((unit) => (
                                <div key={unit.unitId} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <div className="font-medium">{unit.unitName}</div>
                                            <div className="text-xs text-muted-foreground">{unit.subjectName}</div>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {unit.clearedCoreProblems} / {unit.totalCoreProblems} クリア
                                        </div>
                                    </div>
                                    <Progress value={unit.progressPercentage} className="h-2" />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle>直近の学習履歴</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {recentHistory.map((history) => (
                                    <div key={history.id} className="flex flex-col space-y-2 border-b pb-4 last:border-0">
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium text-sm">
                                                {history.problem.coreProblem.name}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                    ({history.problem.coreProblem.unit.name})
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(history.answeredAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="text-sm bg-muted/50 p-3 rounded-md">
                                            Q: {history.problem.question}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                            <Badge variant={
                                                history.evaluation === 'A' ? 'default' :
                                                    history.evaluation === 'B' ? 'secondary' :
                                                        history.evaluation === 'C' ? 'outline' : 'destructive'
                                            }>
                                                評価: {history.evaluation}
                                            </Badge>
                                            {history.userAnswer && (
                                                <span className="text-muted-foreground">回答: {history.userAnswer}</span>
                                            )}
                                        </div>
                                        {history.feedback && (
                                            <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded border border-blue-100">
                                                <span className="font-bold text-blue-600">AI:</span> {history.feedback}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="profile" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <ProfileCard
                            userId={student.id}
                            initialBio={student.bio}
                            initialNotes={student.notes}
                            initialBirthday={student.birthday}
                            initialClassroomId={student.classroomId}
                            initialSchool={student.school}
                            initialPhoneNumber={student.phoneNumber}
                            initialEmail={student.email}
                            classrooms={classrooms}
                        />
                        <GuidanceList
                            userId={student.id}
                            records={student.guidanceRecords}
                        />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
