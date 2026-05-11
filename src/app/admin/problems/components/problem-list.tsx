'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Pencil, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SortIcon } from '@/components/ui/sort-icon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    PROBLEM_STATUS_OPTIONS,
    VIDEO_STATUS_OPTIONS,
    getProblemStatusLabel,
    getProblemTypeLabel,
    getVideoStatusLabel,
    type ProblemEditorViewMode,
    type ProblemStatusValue,
    type VideoStatusValue,
} from '@/lib/problem-ui';
import { renderProblemTextHtml } from '@/lib/problem-text';
import { getDisplayQuestionFromStructuredContent } from '@/lib/structured-problem';
import {
    bulkDeleteProblems,
    deleteStandaloneProblem,
    publishProblemRevision,
    sendBackProblem,
    updateProblemStatus,
    updateProblemVideoStatus,
} from '../actions';
import type { ProblemWithRelations } from '../types';
import { SendBackDialog } from './send-back-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const VIDEO_STATUS_BADGE_CLASS: Record<VideoStatusValue, string> = {
    NONE: 'bg-gray-100 text-gray-600 hover:bg-gray-100',
    SHOT: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
    UPLOADED: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
    CONFIGURED: 'bg-green-100 text-green-700 hover:bg-green-100',
};

const PROBLEM_STATUS_BADGE_CLASS: Record<ProblemStatusValue, string> = {
    DRAFT: 'bg-gray-100 text-gray-600 hover:bg-gray-100',
    PUBLISHED: 'bg-green-100 text-green-700 hover:bg-green-100',
    SENT_BACK: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
};

function ProblemStatusCell({ problem }: { problem: ProblemWithRelations }) {
    const [isPending, startTransition] = useTransition();
    const [sendBackOpen, setSendBackOpen] = useState(false);
    const router = useRouter();
    const currentStatus = problem.status as ProblemStatusValue;

    const handleChange = (value: string) => {
        if (value === currentStatus) return;
        const nextStatus = value as ProblemStatusValue;
        if (nextStatus === 'SENT_BACK') {
            setSendBackOpen(true);
            return;
        }
        startTransition(async () => {
            if (nextStatus === 'PUBLISHED') {
                const result = await publishProblemRevision(problem.id);
                if (result.success) {
                    toast.success('公開しました');
                    router.refresh();
                } else {
                    toast.error(result.error || '公開に失敗しました');
                }
                return;
            }

            const result = await updateProblemStatus(problem.id, nextStatus);
            if (result.success) {
                toast.success('ステータスを更新しました');
                router.refresh();
            } else {
                toast.error(result.error || 'ステータスの更新に失敗しました');
            }
        });
    };

    const submitSendBack = (reason: string) => {
        startTransition(async () => {
            const result = await sendBackProblem(problem.id, reason);
            if (result.success) {
                toast.success('差し戻しに変更しました');
                setSendBackOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || '差し戻しに失敗しました');
            }
        });
    };

    const reason = problem.sentBackReason;
    const showTooltip = currentStatus === 'SENT_BACK' && reason !== null && reason !== undefined && reason.length > 0;

    const select = (
        <Select value={currentStatus} onValueChange={handleChange} disabled={isPending}>
            <SelectTrigger
                size="sm"
                className={`h-8 w-[120px] border-none px-2 text-xs font-medium ${PROBLEM_STATUS_BADGE_CLASS[currentStatus]}`}
            >
                <SelectValue>{getProblemStatusLabel(currentStatus)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {PROBLEM_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <>
            {showTooltip ? (
                <TooltipProvider delayDuration={150}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-block">{select}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs whitespace-pre-wrap">{reason}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                select
            )}
            <SendBackDialog
                open={sendBackOpen}
                onOpenChange={setSendBackOpen}
                onConfirm={submitSendBack}
                pending={isPending}
                initialReason={problem.sentBackReason ?? ''}
            />
        </>
    );
}

function VideoStatusCell({ problem }: { problem: ProblemWithRelations }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const currentStatus = problem.videoStatus as VideoStatusValue;
    const hasUrl = !!problem.videoUrl && problem.videoUrl.trim() !== '';
    const isLocked = hasUrl;

    const handleChange = (value: string) => {
        if (value === currentStatus) return;
        startTransition(async () => {
            const result = await updateProblemVideoStatus(problem.id, value as VideoStatusValue);
            if (result.success) {
                toast.success('動画ステータスを更新しました');
                router.refresh();
            } else {
                toast.error(result.error || 'ステータスの更新に失敗しました');
            }
        });
    };

    return (
        <div className="flex flex-col gap-1">
            <Select value={currentStatus} onValueChange={handleChange} disabled={isPending || isLocked}>
                <SelectTrigger
                    size="sm"
                    className={`h-8 w-[120px] border-none px-2 text-xs font-medium ${VIDEO_STATUS_BADGE_CLASS[currentStatus]}`}
                >
                    <SelectValue>{getVideoStatusLabel(currentStatus)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {VIDEO_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {hasUrl && (
                <a
                    href={problem.videoUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                    title={problem.videoUrl ?? ''}
                >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current">
                        <span className="ml-0.5 h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-current" />
                    </span>
                    動画を開く
                </a>
            )}
        </div>
    );
}

function RenderedProblemText({
    text,
    className,
    fallback = '-',
}: {
    text: string | null | undefined;
    className?: string;
    fallback?: string;
}) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
        return <span className="text-xs text-muted-foreground">{fallback}</span>;
    }
    return (
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: renderProblemTextHtml(text ?? '') }}
        />
    );
}

interface ProblemListProps {
    problems: ProblemWithRelations[];
    onEdit: (problem: ProblemWithRelations) => void;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onSort: (column: string) => void;
    viewMode?: ProblemEditorViewMode;
    showMasterNumber?: boolean;
}

export function ProblemList({
    problems,
    onEdit,
    sortBy,
    sortOrder,
    onSort,
    viewMode = 'admin',
    showMasterNumber = true,
}: ProblemListProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const isAuthorView = viewMode === 'author';
    const emptyTableColSpan = (isAuthorView ? 8 : 9) + (showMasterNumber ? 1 : 0);

    const handleDeleteConfirm = () => {
        if (!deleteTarget) return;

        const id = deleteTarget;
        setDeleteTarget(null);

        startTransition(async () => {
            const result = await deleteStandaloneProblem(id);
            if (result.success) {
                toast.success('問題を削除しました');
                router.refresh();
            } else {
                toast.error(result.error || '削除に失敗しました');
            }
        });
    };

    const handleBulkDeleteConfirm = () => {
        const idsToDelete = Array.from(checkedIds);
        setShowBulkDeleteDialog(false);

        startTransition(async () => {
            const result = await bulkDeleteProblems(idsToDelete);
            if (result.success) {
                toast.success(`${result.count}件の問題を削除しました`);
                setCheckedIds(new Set());
                router.refresh();
            } else {
                toast.error(result.error || '一括削除に失敗しました');
            }
        });
    };

    const handleCheckChange = (id: string, checked: boolean) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (checkedIds.size === problems.length) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(problems.map((problem) => problem.id)));
        }
    };

    return (
        <>
            {!isAuthorView && problems.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAll} className="min-h-11">
                        {checkedIds.size === problems.length ? (
                            <>
                                <CheckSquare className="mr-2 h-4 w-4" />
                                全解除
                            </>
                        ) : (
                            <>
                                <Square className="mr-2 h-4 w-4" />
                                全選択
                            </>
                        )}
                    </Button>
                    {checkedIds.size > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowBulkDeleteDialog(true)}
                            disabled={isPending}
                            className="min-h-11"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {checkedIds.size}件削除
                        </Button>
                    )}
                </div>
            )}

            <div className="space-y-3 md:hidden">
                {problems.length === 0 ? (
                    <div className="rounded-md border bg-card py-8 text-center text-sm text-muted-foreground">
                        問題が見つかりませんでした
                    </div>
                ) : (
                    problems.map((problem) => {
                        const displayQuestion =
                            getDisplayQuestionFromStructuredContent(problem.publishedRevision?.structuredContent)
                            || problem.question
                            || '';
                        const displayAnswer = problem.publishedRevision?.correctAnswer ?? problem.answer ?? '';
                        return (
                        <div key={problem.id} className="rounded-lg border bg-card p-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    {!isAuthorView && (
                                        <Checkbox
                                            checked={checkedIds.has(problem.id)}
                                            onCheckedChange={(checked) => handleCheckChange(problem.id, checked === true)}
                                        />
                                    )}
                                    <div>
                                        {showMasterNumber && (
                                            <p className="font-mono text-sm font-bold">No.{problem.masterNumber || '-'}</p>
                                        )}
                                        <p className="font-mono text-xs text-muted-foreground">{problem.customId}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                                    <Button variant="outline" size="sm" className="min-h-11" onClick={() => onEdit(problem)}>
                                        <Pencil className="mr-1 h-4 w-4" />
                                        {isAuthorView ? '開く' : '編集'}
                                    </Button>
                                    {!isAuthorView && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="min-h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                            disabled={isPending}
                                            onClick={() => setDeleteTarget(problem.id)}
                                        >
                                            <Trash2 className="mr-1 h-4 w-4" />
                                            削除
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex flex-wrap gap-2">
                                    <Badge>{getProblemTypeLabel(problem.problemType)}</Badge>
                                    <ProblemStatusCell problem={problem} />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">問題文</p>
                                    <RenderedProblemText
                                        text={displayQuestion}
                                        className="whitespace-pre-wrap text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
                                    />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">解答</p>
                                    <RenderedProblemText
                                        text={displayAnswer}
                                        className="whitespace-pre-wrap text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
                                    />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">所属単元</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {problem.coreProblems.map((cp) => (
                                            <Badge key={cp.id} variant="secondary" className="text-xs">
                                                {cp.subject.name} &gt; {cp.name}
                                            </Badge>
                                        ))}
                                        {problem.coreProblems.length === 0 && (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">動画</p>
                                    <div className="mt-1">
                                        <VideoStatusCell problem={problem} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        );
                    })
                )}
            </div>

            <div className="hidden rounded-md border md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {!isAuthorView && <TableHead className="w-[50px]" />}
                            {showMasterNumber && (
                                <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => onSort('masterNumber')}>
                                    <div className="flex items-center">
                                        マスタNo
                                        <SortIcon active={sortBy === 'masterNumber'} sortOrder={sortOrder} />
                                    </div>
                                </TableHead>
                            )}
                            <TableHead className="w-[120px] cursor-pointer hover:bg-muted/50" onClick={() => onSort('customId')}>
                                <div className="flex items-center">
                                    ID
                                    <SortIcon active={sortBy === 'customId'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="w-[320px]">問題文</TableHead>
                            <TableHead className="w-[130px]">形式</TableHead>
                            <TableHead className="w-[120px]">公開状況</TableHead>
                            <TableHead className="w-[220px]">解答</TableHead>
                            <TableHead className="w-[180px]">所属単元</TableHead>
                            <TableHead className="w-[140px]">動画</TableHead>
                            <TableHead className="w-[120px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {problems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={emptyTableColSpan} className="py-8 text-center text-muted-foreground">
                                    問題が見つかりませんでした
                                </TableCell>
                            </TableRow>
                        ) : (
                            problems.map((problem) => {
                                const displayQuestion =
                                    getDisplayQuestionFromStructuredContent(problem.publishedRevision?.structuredContent)
                                    || problem.question
                                    || '';
                                const displayAnswer = problem.publishedRevision?.correctAnswer ?? problem.answer ?? '';
                                return (
                                <TableRow key={problem.id}>
                                    {!isAuthorView && (
                                        <TableCell>
                                            <Checkbox
                                                checked={checkedIds.has(problem.id)}
                                                onCheckedChange={(checked) => handleCheckChange(problem.id, checked === true)}
                                            />
                                        </TableCell>
                                    )}
                                    {showMasterNumber && (
                                        <TableCell className="font-mono text-sm font-bold">{problem.masterNumber || '-'}</TableCell>
                                    )}
                                    <TableCell className="font-mono text-xs text-muted-foreground">{problem.customId}</TableCell>
                                    <TableCell className="max-w-[320px] align-top" title={displayQuestion}>
                                        <RenderedProblemText
                                            text={displayQuestion}
                                            className="whitespace-pre-wrap break-words text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
                                        />
                                    </TableCell>
                                    <TableCell className="text-xs">{getProblemTypeLabel(problem.problemType)}</TableCell>
                                    <TableCell><ProblemStatusCell problem={problem} /></TableCell>
                                    <TableCell className="max-w-[220px] align-top" title={displayAnswer}>
                                        <RenderedProblemText
                                            text={displayAnswer}
                                            className="whitespace-pre-wrap break-words text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
                                        />
                                    </TableCell>
                                    <TableCell className="max-w-[180px] align-top">
                                        <div className="flex flex-wrap gap-1">
                                            {problem.coreProblems.map((cp) => (
                                                <Badge key={cp.id} variant="secondary" className="text-xs">
                                                    {cp.subject.name} &gt; {cp.name}
                                                </Badge>
                                            ))}
                                            {problem.coreProblems.length === 0 && (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <VideoStatusCell problem={problem} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => onEdit(problem)}>
                                                <Pencil className="mr-1 h-4 w-4" />
                                                {isAuthorView ? '開く' : '編集'}
                                            </Button>
                                            {!isAuthorView && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                                    disabled={isPending}
                                                    onClick={() => setDeleteTarget(problem.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {!isAuthorView && (
                <>
                    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>問題を削除しますか？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    この操作は取り消せません。学習履歴なども削除されます。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteConfirm}
                                    className="bg-red-500 hover:bg-red-600"
                                    disabled={isPending}
                                >
                                    削除
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{checkedIds.size}件の問題を削除しますか？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    選択した問題と関連する学習履歴が削除されます。この操作は取り消せません。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleBulkDeleteConfirm}
                                    className="bg-red-500 hover:bg-red-600"
                                    disabled={isPending}
                                >
                                    {checkedIds.size}件削除
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </>
    );
}
