'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Problem } from '@prisma/client';
import { createStandaloneProblem, updateStandaloneProblem } from '../actions';
import { toast } from 'sonner';
import { CoreProblemSelector, SelectedCoreProblem } from './core-problem-selector';

interface ProblemWithRelations extends Problem {
    masterNumber: number | null;
    coreProblems: {
        id: string;
        name: string;
        subject: { name: string };
    }[];
}

interface ProblemDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    problem: ProblemWithRelations | null;
    onSuccess: () => void;
}

type ProblemFormState = {
    question: string;
    answer: string;
    grade: string;
    masterNumber: number | undefined;
    videoUrl: string;
    coreProblems: SelectedCoreProblem[];
};

function createInitialFormState(problem: ProblemWithRelations | null): ProblemFormState {
    return {
        question: problem?.question ?? '',
        answer: problem?.answer ?? '',
        grade: problem?.grade ?? '',
        masterNumber: problem?.masterNumber ?? undefined,
        videoUrl: problem?.videoUrl ?? '',
        coreProblems: problem?.coreProblems ?? [],
    };
}

function ProblemDialogForm({
    problem,
    onOpenChange,
    onSuccess,
}: Omit<ProblemDialogProps, 'open'>) {
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState<ProblemFormState>(() => createInitialFormState(problem));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const data = {
                question: formData.question,
                answer: formData.answer,
                grade: formData.grade || undefined,
                masterNumber: formData.masterNumber,
                videoUrl: formData.videoUrl || undefined,
                coreProblemIds: formData.coreProblems.map((cp) => cp.id),
            };

            const result = problem
                ? await updateStandaloneProblem(problem.id, data)
                : await createStandaloneProblem(data);

            if (result.success) {
                toast.success(problem ? '問題を更新しました' : '問題を作成しました');
                onSuccess();
            } else {
                toast.error(result.error || '保存に失敗しました');
            }
        });
    };

    return (
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{problem ? '問題の編集' : '新規問題作成'}</DialogTitle>
                <DialogDescription>
                    問題の内容と紐付けを設定します。
                </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 py-4">
                <div className="flex space-x-4">
                    <div className="flex-1 space-y-2">
                        <Label>マスタ内問題番号 (任意)</Label>
                        <Input
                            type="number"
                            value={formData.masterNumber || ''}
                            onChange={(e) => setFormData((prev) => ({
                                ...prev,
                                masterNumber: e.target.value ? parseInt(e.target.value, 10) : undefined,
                            }))}
                            placeholder="例: 1001"
                        />
                    </div>
                    <div className="flex-[3] space-y-2">
                        <Label>問題文</Label>
                        <Textarea
                            required
                            value={formData.question}
                            onChange={(e) => setFormData((prev) => ({ ...prev, question: e.target.value }))}
                            placeholder="問題文を入力してください"
                            rows={3}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>解答 (任意)</Label>
                        <Input
                            value={formData.answer}
                            onChange={(e) => setFormData((prev) => ({ ...prev, answer: e.target.value }))}
                            placeholder="解答 (空欄可)"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>学年 (任意)</Label>
                        <Input
                            value={formData.grade}
                            onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
                            placeholder="例: 中1"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>解説動画URL (任意)</Label>
                    <Input
                        value={formData.videoUrl}
                        onChange={(e) => setFormData((prev) => ({ ...prev, videoUrl: e.target.value }))}
                        placeholder="https://..."
                    />
                </div>

                <div className="space-y-3 pt-4 border-t">
                    <Label>紐付け（コア問題・単元）</Label>
                    <CoreProblemSelector
                        selected={formData.coreProblems}
                        onChange={(coreProblems) => setFormData((prev) => ({ ...prev, coreProblems }))}
                        active
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
                    <Button type="submit" disabled={isPending}>
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        保存
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

export function ProblemDialog({ open, onOpenChange, problem, onSuccess }: ProblemDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && (
                <ProblemDialogForm
                    key={problem ? `edit-${problem.id}` : 'create'}
                    problem={problem}
                    onOpenChange={onOpenChange}
                    onSuccess={onSuccess}
                />
            )}
        </Dialog>
    );
}
