'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { ProblemList } from './components/problem-list';
import { ProblemDialog } from './components/problem-dialog';
import { BulkImportDialog } from './components/problem-bulk-import';
import { Problem } from '@prisma/client';

interface ProblemWithRelations extends Problem {
    coreProblems: {
        id: string;
        name: string;
        subject: { name: string };
    }[];
}

interface ProblemManagerProps {
    initialProblems: ProblemWithRelations[];
    totalCount: number;
    currentPage: number;
    initialQuery: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    subjects: { id: string; name: string }[];
}

export function ProblemManager({
    initialProblems,
    totalCount,
    currentPage,
    initialQuery,
    sortBy,
    sortOrder,
    subjects
}: ProblemManagerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState(initialQuery);
    const [selectedProblem, setSelectedProblem] = useState<ProblemWithRelations | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

    const buildParams = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        return params;
    };

    const updateParams = (updates: Record<string, string | undefined>) => {
        const params = buildParams(updates);
        router.push(`/admin/problems?${params.toString()}`);
    };

    const buildHref = (updates: Record<string, string | undefined>) => {
        const params = buildParams(updates);
        return `/admin/problems?${params.toString()}`;
    };

    const selectedSubjectId = searchParams.get('subjectId') || 'ALL';

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(() => {
            updateParams({ q: query, page: '1' });
        });
    };

    const handleCreate = () => {
        setSelectedProblem(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (problem: ProblemWithRelations) => {
        setSelectedProblem(problem);
        setIsDialogOpen(true);
    };

    const handleSuccess = () => {
        setIsDialogOpen(false);
        router.refresh();
    };

    const handleSort = (column: string) => {
        const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
        startTransition(() => {
            updateParams({ sortBy: column, sortOrder: newOrder });
        });
    };

    const handleSubjectFilter = (subjectId: string) => {
        startTransition(() => {
            updateParams({
                subjectId: subjectId === 'ALL' ? undefined : subjectId,
                page: '1'
            });
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1">
                    <form onSubmit={handleSearch} className="flex gap-2 w-full sm:max-w-sm">
                        <Input
                            placeholder="問題文、解答、ID、単元名で検索..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <Button type="submit" disabled={isPending}>
                            検索
                        </Button>
                    </form>
                    <Select value={selectedSubjectId} onValueChange={handleSubjectFilter}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="科目" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">全科目</SelectItem>
                            {subjects.map(subject => (
                                <SelectItem key={subject.id} value={subject.id}>
                                    {subject.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex gap-2">
                    <Button onClick={() => setIsBulkDialogOpen(true)} variant="outline">
                        一括登録
                    </Button>
                    <Button onClick={handleCreate}>
                        <Plus className="w-4 h-4 mr-2" />
                        新規作成
                    </Button>
                </div>
            </div>

            <ProblemList
                problems={initialProblems}
                onEdit={handleEdit}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
            />

            <div className="flex justify-between items-center text-sm text-muted-foreground">
                <div>全 {totalCount} 件</div>
                <div className="flex gap-2 items-center">
                    {currentPage > 1 ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={buildHref({ page: String(currentPage - 1) })}>
                                前へ
                            </Link>
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
                            <Link href={buildHref({ page: String(currentPage + 1) })}>
                                次へ
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled>
                            次へ
                        </Button>
                    )}
                </div>
            </div>

            <ProblemDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                problem={selectedProblem}
                onSuccess={handleSuccess}
            />

            <BulkImportDialog
                open={isBulkDialogOpen}
                onOpenChange={setIsBulkDialogOpen}
                onSuccess={() => {
                    setIsBulkDialogOpen(false);
                    router.refresh();
                }}
            />
        </div>
    );
}
