import { redirect } from 'next/navigation';
import { AlertTriangle, Clock, Target, Trophy } from 'lucide-react';

import { DateDisplay } from '@/components/ui/date-display';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getStudentOverviewData } from '@/lib/analytics';
import { getTranslations } from 'next-intl/server';

import { PrintProblemCard } from './print-problem-card';

function resolveLegacyTabHref(userId: string, tab: string) {
    if (tab === 'overview') {
        return `/teacher/students/${userId}`;
    }

    if (tab === 'goals') {
        return `/teacher/students/${userId}/goals`;
    }

    if (tab === 'history') {
        return `/teacher/students/${userId}/history`;
    }

    if (tab === 'guidance') {
        return `/teacher/students/${userId}/guidance`;
    }

    if (tab === 'profile') {
        return `/teacher/students/${userId}/profile`;
    }

    return null;
}

export default async function TeacherStudentOverviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { userId } = await params;
    const query = await searchParams;
    const legacyTab = typeof query.tab === 'string' ? resolveLegacyTabHref(userId, query.tab) : null;

    if (legacyTab && legacyTab !== `/teacher/students/${userId}`) {
        redirect(legacyTab);
    }

    const [{ stats, subjectProgress, weaknesses, subjects }, t] = await Promise.all([
        getStudentOverviewData(userId),
        getTranslations('TeacherStudentOverview'),
    ]);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PrintProblemCard userId={userId} subjects={subjects} />
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('accuracy')}</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.accuracy < 50 ? 'text-red-500' : 'text-green-600'}`}>
                            {stats.accuracy}%
                        </div>
                        <p className="text-xs text-muted-foreground">{t('correctCount', { count: stats.totalCorrect })}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('currentStreak')}</CardTitle>
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{t('streakDays', { count: stats.currentStreak })}</div>
                        <p className="text-xs text-muted-foreground">{t('streakCaption')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('lastActivity')}</CardTitle>
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
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            {t('weaknessTitle')}
                        </CardTitle>
                        <CardDescription>{t('weaknessDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {weaknesses.length > 0 ? (
                                weaknesses.map((weakness) => (
                                    <div
                                        key={weakness.coreProblemId}
                                        className="flex flex-col gap-1 border-b pb-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">{weakness.coreProblemName}</p>
                                            <p className="text-xs text-muted-foreground">{weakness.subjectName}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-lg font-bold text-red-500">{weakness.accuracy}%</span>
                                            <p className="text-xs text-muted-foreground">{t('attemptCount', { count: weakness.totalAttempts })}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-8 text-center text-muted-foreground">{t('noWeakness')}</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('subjectProgressTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    {subjectProgress.map((subject) => (
                        <div key={subject.subjectId} className="space-y-2">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="space-y-0.5">
                                    <div className="font-medium">{subject.subjectName}</div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {t('clearedCount', {
                                        cleared: subject.clearedCoreProblems,
                                        total: subject.totalCoreProblems,
                                    })}
                                </div>
                            </div>
                            <Progress value={subject.progressPercentage} className="h-2" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
