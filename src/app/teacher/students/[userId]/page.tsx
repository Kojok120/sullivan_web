import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Clock, Target, Trophy } from 'lucide-react';
import { getStudentDashboardData } from '@/lib/analytics'; // Removed individual functions
import { ActivityChart } from '@/app/dashboard/activity-chart';
import { ProfileCard } from './profile-card';
import { GuidanceList } from './guidance-list';
import { PrintProblemCard } from './print-problem-card';
import { DateDisplay } from '@/components/ui/date-display';
import { SessionList } from '@/app/dashboard/components/session-list';

export default async function TeacherStudentDetailPage({
    params,
    searchParams,
}: {
    params: { userId: string };
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) redirect('/login');

    const { userId } = await params;
    const query = await searchParams;
    const defaultTab = (typeof query.tab === 'string' && ['overview', 'history', 'profile'].includes(query.tab)) ? query.tab : 'overview';

    const dashboardData = await getStudentDashboardData(userId);

    if (!dashboardData || !dashboardData.student) {
        return (
            <div className="container mx-auto py-8 px-4 text-center">
                <h1 className="text-2xl font-bold">生徒が見つかりません</h1>
                <Button asChild className="mt-4">
                    <Link href="/teacher">一覧に戻る</Link>
                </Button>
            </div>
        );
    }

    const { student, stats, subjectProgress, dailyActivity, weaknesses, recentHistory, subjects } = dashboardData;
    const classrooms = await prisma.classroom.findMany({ orderBy: { createdAt: 'asc' } });


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
                        {student.group && <Badge variant="outline">{student.group}</Badge>}
                    </h1>
                    <p className="text-muted-foreground">生徒詳細データ</p>
                </div>
            </div>

            <Tabs defaultValue={defaultTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">学習状況</TabsTrigger>
                    <TabsTrigger value="history">学習履歴ログ</TabsTrigger>
                    <TabsTrigger value="profile">生徒情報</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    {/* Overview Stats */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <PrintProblemCard userId={student.id} subjects={subjects} />
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
                                    {stats.lastActivity ? <DateDisplay date={stats.lastActivity} /> : '-'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {stats.lastActivity ? <DateDisplay date={stats.lastActivity} showTime /> : ''}
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
                                                    <p className="text-xs text-muted-foreground">{w.subjectName}</p>
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

                    {/* Subject Progress */}
                    <Card>
                        <CardHeader>
                            <CardTitle>科目別進捗状況</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {subjectProgress.map((subject) => (
                                <div key={subject.subjectId} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <div className="font-medium">{subject.subjectName}</div>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {subject.clearedCoreProblems} / {subject.totalCoreProblems} クリア
                                        </div>
                                    </div>
                                    <Progress value={subject.progressPercentage} className="h-2" />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <SessionList userId={student.id} basePath={`/teacher/students/${student.id}/history`} />
                </TabsContent>

                <TabsContent value="profile" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <ProfileCard
                            userId={student.id}
                            initialBio={student.bio}
                            initialNotes={student.notes}
                            initialBirthday={student.birthday}
                            initialClassroomId={student.classroomId}
                            initialGroupId={student.group}
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
        </div >
    );
}
