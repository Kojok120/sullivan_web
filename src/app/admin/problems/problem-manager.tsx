'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

export function ProblemManager({ initialProblems, totalCount, currentPage, initialQuery }: ProblemManagerProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState(initialQuery);
    const [selectedProblem, setSelectedProblem] = useState<ProblemWithRelations | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(() => {
            router.push(`/admin/problems?q=${encodeURIComponent(query)}&page=1`);
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
                <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm">
                    <Input
                        placeholder="問題文、解答、ID、単元名で検索..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <Button type="submit" disabled={isPending}>
                        検索
                    </Button>
                </form>

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
            />

            <div className="flex justify-between items-center text-sm text-muted-foreground">
                <div>全 {totalCount} 件</div>
                <div className="flex gap-2 items-center">
                    {currentPage > 1 ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/problems?q=${encodeURIComponent(query)}&page=${currentPage - 1}`}>
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
                            <Link href={`/admin/problems?q=${encodeURIComponent(query)}&page=${currentPage + 1}`}>
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
