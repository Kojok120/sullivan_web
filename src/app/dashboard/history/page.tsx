import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLearningHistory, getAllSubjects, HistoryFilter as FilterType, HistorySort } from '@/lib/analytics';
import { HistoryFilter } from './filter';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';

export default async function HistoryPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await getSession();
    if (!session) redirect('/login');

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
        getAllSubjects()
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
                <h1 className="text-3xl font-bold">学習履歴</h1>
            </div>

            <HistoryFilter subjects={subjects} />

            <div className="bg-white rounded-lg shadow border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 uppercase">
                            <tr>
                                <th className="px-6 py-3">日時</th>
                                <th className="px-6 py-3">科目・単元</th>
                                <th className="px-6 py-3">問題</th>
                                <th className="px-6 py-3">評価</th>
                                <th className="px-6 py-3">AIフィードバック</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                                        履歴が見つかりませんでした
                                    </td>
                                </tr>
                            ) : (
                                history.items.map((item) => (
                                    <tr key={item.id} className="border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.answeredAt.toLocaleDateString('ja-JP')} <br />
                                            <span className="text-gray-400 text-xs">{item.answeredAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium">
                                                {item.problem.coreProblems[0]?.subject.name || '不明'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {item.problem.coreProblems.map(c => c.name).join(', ')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 max-w-xs truncate" title={item.problem.question}>
                                            {item.problem.question}
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
                                            <div className="text-xs text-gray-600 line-clamp-3 hover:line-clamp-none cursor-pointer" title={item.feedback || ''}>
                                                {item.feedback || '(フィードバックなし)'}
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
                <div className="p-4 flex items-center justify-between border-t bg-gray-50">
                    <div className="text-sm text-gray-500">
                        全 {history.total} 件中 {(page - 1) * limit + 1} - {Math.min(page * limit, history.total)} 件を表示
                    </div>
                    <div className="flex gap-2">
                        <Link href={hasPrev ? buildLink(page - 1) : '#'}>
                            <Button variant="outline" size="sm" disabled={!hasPrev}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> 前へ
                            </Button>
                        </Link>
                        <Link href={hasNext ? buildLink(page + 1) : '#'}>
                            <Button variant="outline" size="sm" disabled={!hasNext}>
                                次へ <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
