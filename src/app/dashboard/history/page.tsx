import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLearningHistory, getAllSubjects, HistoryFilter as FilterType, HistorySort } from '@/lib/analytics';
import { HistoryFilter } from './filter';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { DateDisplay } from '@/components/ui/date-display';
import { ProblemTextPreview } from '@/app/admin/problems/components/problem-text-preview';
import { getDisplayQuestionFromStructuredContent } from '@/lib/structured-problem';

export default async function HistoryPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await getSession();
    if (!session) redirect('/login');
    const t = await getTranslations('DashboardHistory');

    const params = await searchParams;
    const page = Number(params.page) || 1;
    const limit = 20;
    const sort = (params.sort === 'asc' ? 'asc' : 'desc') as HistorySort;

    const filter: FilterType = {
        subjectId: typeof params.subjectId === 'string' ? params.subjectId : undefined,
        startDate: typeof params.startDate === 'string' && params.startDate ? new Date(params.startDate) : undefined,
        endDate: typeof params.endDate === 'string' && params.endDate ? new Date(params.endDate) : undefined,
    };

    const [history, subjects] = await Promise.all([
        getLearningHistory(session.userId, page, limit, filter, sort),
        getAllSubjects(session.defaultPackId)
    ]);

    // Pagination helper
    const hasNext = page < history.totalPages;
    const hasPrev = page > 1;

    // Build pagination links keeping other params
    const buildLink = (newPage: number) => {
        const query = new URLSearchParams();
        if (params.subjectId) query.set('subjectId', params.subjectId as string);
        if (params.startDate) query.set('startDate', params.startDate as string);
        if (params.endDate) query.set('endDate', params.endDate as string);
        if (params.sort) query.set('sort', params.sort as string);
        query.set('page', newPage.toString());
        return `?${query.toString()}`;
    };

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard">
                    <Button variant="outline" size="icon">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold">{t('title')}</h1>
            </div>

            <HistoryFilter subjects={subjects} />

            <div className="bg-card rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground uppercase">
                            <tr>
                                <th className="px-6 py-3">{t('dateHeader')}</th>
                                <th className="px-6 py-3">{t('subjectUnitHeader')}</th>
                                <th className="px-6 py-3">{t('problemHeader')}</th>
                                <th className="px-6 py-3">{t('evaluationHeader')}</th>
                                <th className="px-6 py-3">{t('feedbackHeader')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                                        {t('empty')}
                                    </td>
                                </tr>
                            ) : (
                                history.items.map((item) => (
                                    <tr key={item.id} className="border-b hover:bg-muted/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <DateDisplay date={item.answeredAt} showTime />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium">
                                                {item.problem.coreProblems[0]?.subject.name || t('unknown')}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {item.problem.coreProblems.map(c => c.name).join(', ')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 max-w-xs">
                                            <ProblemTextPreview
                                                text={getDisplayQuestionFromStructuredContent(item.problem.publishedRevision?.structuredContent)}
                                                className="text-sm leading-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_svg.numberline]:max-w-full"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                                ${item.evaluation === 'A' ? 'bg-green-100 text-green-800' :
                                                    item.evaluation === 'B' ? 'bg-blue-100 text-blue-800' :
                                                        item.evaluation === 'C' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-red-100 text-red-800'}`}>
                                                {item.evaluation}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 max-w-md">
                                            <div className="text-xs text-muted-foreground line-clamp-3 hover:line-clamp-none cursor-pointer" title={item.feedback || ''}>
                                                {item.feedback || t('noFeedback')}
                                            </div>
                                            {/* Causes display if C/D? */}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 flex items-center justify-between border-t bg-muted">
                    <div className="text-sm text-muted-foreground">
                        {t('paginationRange', {
                            total: history.total,
                            start: (page - 1) * limit + 1,
                            end: Math.min(page * limit, history.total),
                        })}
                    </div>
                    <div className="flex gap-2">
                        <Link href={hasPrev ? buildLink(page - 1) : '#'}>
                            <Button variant="outline" size="sm" disabled={!hasPrev}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> {t('previous')}
                            </Button>
                        </Link>
                        <Link href={hasNext ? buildLink(page + 1) : '#'}>
                            <Button variant="outline" size="sm" disabled={!hasNext}>
                                {t('next')} <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
