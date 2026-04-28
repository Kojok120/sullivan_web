'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, CheckSquare, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { deleteStandaloneProblem, bulkDeleteProblems } from '../actions';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import type { ProblemWithRelations } from '../types';

interface ProblemListProps {
    problems: ProblemWithRelations[];
    onEdit: (problem: ProblemWithRelations) => void;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onSort: (column: string) => void;
}

export function ProblemList({ problems, onEdit, sortBy, sortOrder, onSort }: ProblemListProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

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
        setCheckedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (checkedIds.size === problems.length) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(problems.map(p => p.id)));
        }
    };

    return (
        <>
            {/* Bulk Actions Header */}
            {problems.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        className="min-h-11"
                    >
                        {checkedIds.size === problems.length ? (
                            <>
                                <CheckSquare className="h-4 w-4 mr-2" />
                                全解除
                            </>
                        ) : (
                            <>
                                <Square className="h-4 w-4 mr-2" />
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
                            <Trash2 className="h-4 w-4 mr-2" />
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
                    problems.map((problem) => (
                        <div key={problem.id} className="rounded-lg border bg-card p-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={checkedIds.has(problem.id)}
                                        onCheckedChange={(checked) => handleCheckChange(problem.id, checked === true)}
                                    />
                                    <div>
                                        <p className="font-mono text-sm font-bold">No.{problem.masterNumber || '-'}</p>
                                        <p className="font-mono text-xs text-muted-foreground">{problem.customId || '-'}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                                    <Button variant="outline" size="sm" className="min-h-11" onClick={() => onEdit(problem)}>
                                        <Pencil className="mr-1 h-4 w-4" />
                                        編集
                                    </Button>
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
                                </div>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">問題文</p>
                                    <p className="whitespace-pre-wrap">{problem.question}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">解答</p>
                                    <p className="whitespace-pre-wrap">{problem.answer || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">所属コア問題</p>
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
                                    {problem.videoUrl ? (
                                        <a
                                            href={problem.videoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 underline underline-offset-2"
                                        >
                                            動画を開く
                                        </a>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="hidden border rounded-md md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead
                                className="w-[100px] cursor-pointer hover:bg-muted/50"
                                onClick={() => onSort('masterNumber')}
                            >
                                <div className="flex items-center">
                                    マスタNo
                                    <SortIcon active={sortBy === 'masterNumber'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead
                                className="w-[120px] cursor-pointer hover:bg-muted/50" // kept ID column just in case
                                onClick={() => onSort('customId')}
                            >
                                <div className="flex items-center">
                                    ID
                                    <SortIcon active={sortBy === 'customId'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead>問題文</TableHead>
                            <TableHead>解答</TableHead>
                            <TableHead>所属コア問題</TableHead>
                            <TableHead className="w-[60px]">動画</TableHead>
                            <TableHead className="w-[100px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {problems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    問題が見つかりませんでした
                                </TableCell>
                            </TableRow>
                        ) : (
                            problems.map((problem) => (
                                <TableRow key={problem.id}>
                                    <TableCell>
                                        <Checkbox
                                            checked={checkedIds.has(problem.id)}
                                            onCheckedChange={(checked) => handleCheckChange(problem.id, checked === true)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-mono text-sm font-bold">{problem.masterNumber || '-'}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{problem.customId || '-'}</TableCell>
                                    <TableCell className="min-w-[200px] whitespace-pre-wrap" title={problem.question}>
                                        {problem.question}
                                    </TableCell>
                                    <TableCell className="min-w-[150px] whitespace-pre-wrap" title={problem.answer || ''}>
                                        {problem.answer}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {problem.coreProblems.map((cp) => (
                                                <Badge key={cp.id} variant="secondary" className="text-xs">
                                                    {cp.subject.name} &gt; {cp.name}
                                                </Badge>
                                            ))}
                                            {problem.coreProblems.length === 0 && (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {problem.videoUrl ? (
                                            <a
                                                href={problem.videoUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center text-blue-500 hover:text-blue-700"
                                                title={problem.videoUrl}
                                            >
                                                <div className="w-5 h-5 flex items-center justify-center border border-current rounded-full">
                                                    <div className="w-0 h-0 border-l-[6px] border-l-current border-y-[4px] border-y-transparent ml-0.5" />
                                                </div>
                                            </a>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onEdit(problem)}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                disabled={isPending}
                                                onClick={() => setDeleteTarget(problem.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Single Delete Dialog */}
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

            {/* Bulk Delete Dialog */}
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
    );
}
