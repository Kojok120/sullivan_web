import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentDashboardData } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityChart } from '@/app/dashboard/activity-chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SubjectProgressList } from '@/components/subject-progress-list';
import { DateDisplay } from '@/components/ui/date-display';
import { ProblemTextPreview } from '@/app/admin/problems/components/problem-text-preview';
import { getDisplayQuestionFromStructuredContent } from '@/lib/structured-problem';

interface PageProps {
    params: Promise<{
        userId: string;
    }>;
}

export default async function StudentAnalyticsPage({ params }: PageProps) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');
    const t = await getTranslations('AdminStudentAnalyticsPage');

    const { userId } = await params;

    // 共通サービスを使用してデータ取得を統一
    const dashboardData = await getStudentDashboardData(userId);
    if (!dashboardData) return <div>{t('studentNotFound')}</div>;

    const { stats, subjectProgress, dailyActivity, recentHistory, student } = dashboardData;


    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl font-bold sm:text-3xl">{t('title', { name: student.name || student.loginId })}</h1>
                <p className="text-muted-foreground">
                    {student.group || t('noGroup')} | {student.role}
                </p>
            </div>

            {/* Stats Cards */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4 sm:mb-8">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('totalAnswers')}</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalProblemsSolved}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('accuracy')}</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.accuracy}%</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('currentStreak')}</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{t('streakDays', { days: stats.currentStreak })}</div></CardContent>
                </Card>

            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-7 sm:mb-8">
                {/* Activity Chart */}
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>{t('activityTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ActivityChart data={dailyActivity} />
                    </CardContent>
                </Card>

                {/* Subject Progress */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>{t('subjectProgressTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <SubjectProgressList
                            items={subjectProgress}
                            wrapperClassName="space-y-6 max-h-[350px] overflow-y-auto pr-2"
                            emptyMessage={t('noLearningData')}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Recent History Log */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('recentHistoryTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 md:hidden">
                        {recentHistory.map((history) => (
                            <div key={history.id} className="rounded-lg border bg-card p-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-xs text-muted-foreground"><DateDisplay date={history.answeredAt} showTime /></p>
                                    <Badge variant={['A', 'B'].includes(history.evaluation) ? 'default' : 'destructive'}>
                                        {history.evaluation}
                                    </Badge>
                                </div>
                                <p className="text-sm font-medium">
                                    {history.problem.coreProblems[0]?.subject.name || '-'} / {history.problem.coreProblems[0]?.name || '-'}
                                </p>
                                <ProblemTextPreview
                                    text={getDisplayQuestionFromStructuredContent(history.problem.publishedRevision?.structuredContent)}
                                    className="mt-1 text-sm leading-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_svg.numberline]:max-w-full"
                                />
                                <div className="mt-2 space-y-1 text-xs">
                                    <div className="flex items-start gap-1">
                                        <span className="font-medium shrink-0">{t('answerLabel')}</span>
                                        {history.userAnswer ? (
                                            <ProblemTextPreview
                                                text={history.userAnswer}
                                                className="text-xs leading-5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_svg.numberline]:max-w-full"
                                            />
                                        ) : (
                                            <span>-</span>
                                        )}
                                    </div>
                                    {history.feedback && <p className="text-muted-foreground">FB: {history.feedback}</p>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('dateHeader')}</TableHead>
                                    <TableHead>{t('subjectUnitHeader')}</TableHead>
                                    <TableHead>{t('problemHeader')}</TableHead>
                                    <TableHead>{t('evaluationHeader')}</TableHead>
                                    <TableHead>{t('aiGradingHeader')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentHistory.map((history) => (
                                    <TableRow key={history.id}>
                                        <TableCell className="whitespace-nowrap">
                                            <DateDisplay date={history.answeredAt} showTime />
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm font-medium">
                                                {history.problem.coreProblems[0]?.subject.name || '-'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {history.problem.coreProblems[0]?.name || '-'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[300px]">
                                            <ProblemTextPreview
                                                text={getDisplayQuestionFromStructuredContent(history.problem.publishedRevision?.structuredContent)}
                                                className="text-sm leading-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_svg.numberline]:max-w-full"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={['A', 'B'].includes(history.evaluation) ? 'default' : 'destructive'}>
                                                {history.evaluation}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {history.userAnswer ? (
                                                    <div className="flex items-start gap-1">
                                                        <span className="text-xs font-medium shrink-0">{t('answerLabel')}</span>
                                                        <ProblemTextPreview
                                                            text={history.userAnswer}
                                                            className="text-xs leading-5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_svg.numberline]:max-w-full"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-medium">{t('answerEmpty')}</span>
                                                )}
                                                {history.feedback && (
                                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={history.feedback}>
                                                        FB: {history.feedback}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
