'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProblemList } from './components/problem-list';
import { BulkImportDialog } from './components/problem-bulk-import';
import type { ProblemWithRelations } from './types';
import {
    CONTENT_FORMAT_OPTIONS,
    PROBLEM_STATUS_OPTIONS,
    PROBLEM_TYPE_OPTIONS,
    type ProblemEditorViewMode,
} from '@/lib/problem-ui';
import type { BulkImportVariant } from './problem-list-policy';

type ProblemManagerSubject = {
    id: string;
    name: string;
    coreProblems: {
        id: string;
        name: string;
    }[];
};

interface ProblemManagerProps {
    initialProblems: ProblemWithRelations[];
    totalCount: number;
    currentPage: number;
    initialQuery: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    subjects: ProblemManagerSubject[];
    currentSubject: ProblemManagerSubject;
    structuredProblemsEnabled: boolean;
    routeBase?: string;
    viewMode?: ProblemEditorViewMode;
    showMasterNumber?: boolean;
    showBulkImport?: boolean;
    bulkImportLabel?: string;
    bulkImportConfig?: {
        defaultSubjectId?: string;
        lockSubjectSelection?: boolean;
        variant?: BulkImportVariant;
    };
}

export function ProblemManager({
    initialProblems,
    totalCount,
    currentPage,
    initialQuery,
    sortBy,
    sortOrder,
    subjects,
    currentSubject,
    structuredProblemsEnabled,
    routeBase = '/admin/problems',
    viewMode = 'admin',
    showMasterNumber = true,
    showBulkImport,
    bulkImportLabel = '一括登録',
    bulkImportConfig,
}: ProblemManagerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState(initialQuery);
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const isAuthorView = viewMode === 'author';
    const resolvedShowBulkImport = showBulkImport ?? !isAuthorView;
    const resolvedBulkImportConfig = bulkImportConfig ?? { variant: 'default' as const };

    const buildParams = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        if (!showMasterNumber && params.get('sortBy') === 'masterNumber') {
            params.delete('sortBy');
            params.delete('sortOrder');
        }

        return params;
    };

    const updateParams = (updates: Record<string, string | undefined>) => {
        const params = buildParams(updates);
        router.push(`${routeBase}?${params.toString()}`);
    };

    const buildHref = (updates: Record<string, string | undefined>) => {
        const params = buildParams(updates);
        return `${routeBase}?${params.toString()}`;
    };

    const rawSelectedCoreProblemId = searchParams.get('coreProblemId');
    const selectedVideoFilter = searchParams.get('video') || 'ALL';
    const selectedProblemType = searchParams.get('problemType') || 'ALL';
    const selectedContentFormat = searchParams.get('contentFormat') || 'ALL';
    const selectedStatus = searchParams.get('status') || 'ALL';
    const availableCoreProblems = currentSubject.coreProblems;
    const selectedCoreProblemId = rawSelectedCoreProblemId
        && availableCoreProblems.some((coreProblem) => coreProblem.id === rawSelectedCoreProblemId)
        ? rawSelectedCoreProblemId
        : 'ALL';

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(() => {
            updateParams({ q: query, page: '1' });
        });
    };

    const handleEdit = (problem: ProblemWithRelations) => {
        router.push(`${routeBase}/${problem.id}`);
    };

    const handleSort = (column: string) => {
        const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
        startTransition(() => {
            updateParams({ sortBy: column, sortOrder: newOrder });
        });
    };

    const handleCoreProblemFilter = (coreProblemId: string) => {
        startTransition(() => {
            updateParams({
                coreProblemId: coreProblemId === 'ALL' ? undefined : coreProblemId,
                page: '1',
            });
        });
    };

    const handleVideoFilter = (value: string) => {
        startTransition(() => {
            updateParams({
                video: value === 'ALL' ? undefined : value,
                page: '1',
            });
        });
    };

    const handleProblemTypeFilter = (value: string) => {
        startTransition(() => {
            updateParams({
                problemType: value === 'ALL' ? undefined : value,
                page: '1',
            });
        });
    };

    const handleContentFormatFilter = (value: string) => {
        startTransition(() => {
            updateParams({
                contentFormat: value === 'ALL' ? undefined : value,
                page: '1',
            });
        });
    };

    const handleStatusFilter = (value: string) => {
        startTransition(() => {
            updateParams({
                status: value === 'ALL' ? undefined : value,
                page: '1',
            });
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-1">
                    <form onSubmit={handleSearch} className="flex w-full gap-2 sm:max-w-sm">
                        <Input
                            placeholder={
                                isAuthorView
                                    ? '問題名、問題文、ID、単元名で検索...'
                                    : showMasterNumber
                                        ? '問題文、解答、ID、マスタNo、単元名で検索...'
                                        : '問題文、解答、ID、単元名で検索...'
                            }
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <Button type="submit" disabled={isPending} className="min-h-11 sm:min-h-10">
                            検索
                        </Button>
                    </form>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <Select value={selectedCoreProblemId} onValueChange={handleCoreProblemFilter}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="単元" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">全単元</SelectItem>
                                {availableCoreProblems.map((coreProblem) => (
                                    <SelectItem key={coreProblem.id} value={coreProblem.id}>
                                        {coreProblem.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedVideoFilter} onValueChange={handleVideoFilter}>
                            <SelectTrigger className="w-full sm:w-[150px]">
                                <SelectValue placeholder="動画" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">動画：全件</SelectItem>
                                <SelectItem value="exists">動画あり</SelectItem>
                                <SelectItem value="none">動画なし</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={selectedProblemType} onValueChange={handleProblemTypeFilter}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="問題形式" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">形式：全件</SelectItem>
                                {PROBLEM_TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!isAuthorView && (
                            <Select value={selectedContentFormat} onValueChange={handleContentFormatFilter}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="本文形式" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">本文：全件</SelectItem>
                                    {CONTENT_FORMAT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Select value={selectedStatus} onValueChange={handleStatusFilter}>
                            <SelectTrigger className="w-full sm:w-[160px]">
                                <SelectValue placeholder="公開状況" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">公開状況：全件</SelectItem>
                                {PROBLEM_STATUS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex gap-2">
                    {resolvedShowBulkImport && (
                        <Button onClick={() => setIsBulkDialogOpen(true)} variant="outline" className="min-h-11 flex-1 sm:min-h-10 sm:flex-none">
                            {bulkImportLabel}
                        </Button>
                    )}
                    {structuredProblemsEnabled ? (
                        <Button asChild className="min-h-11 flex-1 sm:min-h-10 sm:flex-none">
                            <Link href={`${routeBase}/new?subjectId=${currentSubject.id}`}>
                                <Plus className="mr-2 h-4 w-4" />
                                {isAuthorView ? '新しい問題を作成' : '問題を作成'}
                            </Link>
                        </Button>
                    ) : (
                        <Button disabled className="min-h-11 flex-1 sm:min-h-10 sm:flex-none">
                            <Plus className="mr-2 h-4 w-4" />
                            {isAuthorView ? '新しい問題を作成' : '問題を作成'}
                        </Button>
                    )}
                </div>
            </div>

            <ProblemList
                problems={initialProblems}
                onEdit={handleEdit}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                viewMode={viewMode}
                showMasterNumber={showMasterNumber}
            />

            <div className="flex flex-col items-start justify-between gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
                <div>全 {totalCount} 件</div>
                <div className="flex items-center gap-2">
                    {currentPage > 1 ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={buildHref({ page: String(currentPage - 1) })}>前へ</Link>
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled>
                            前へ
                        </Button>
                    )}
                    <span className="flex items-center px-2">
                        {currentPage} / {Math.ceil(totalCount / 20) || 1}
                    </span>
                    {currentPage * 20 < totalCount ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={buildHref({ page: String(currentPage + 1) })}>次へ</Link>
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled>
                            次へ
                        </Button>
                    )}
                </div>
            </div>

            {resolvedShowBulkImport && (
                <BulkImportDialog
                    key={[
                        resolvedBulkImportConfig.defaultSubjectId ?? 'default',
                        resolvedBulkImportConfig.lockSubjectSelection ? 'locked' : 'unlocked',
                        resolvedBulkImportConfig.variant,
                    ].join(':')}
                    open={isBulkDialogOpen}
                    onOpenChange={setIsBulkDialogOpen}
                    subjects={subjects}
                    onSuccess={() => router.refresh()}
                    defaultSubjectId={resolvedBulkImportConfig.defaultSubjectId}
                    lockSubjectSelection={resolvedBulkImportConfig.lockSubjectSelection}
                    variant={resolvedBulkImportConfig.variant}
                />
            )}
        </div>
    );
}
