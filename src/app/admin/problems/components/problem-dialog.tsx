'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { VIDEO_STATUS_OPTIONS, resolveVideoStatusFromUrl, type VideoStatusValue } from '@/lib/problem-ui';
import { getDisplayQuestionFromStructuredContent } from '@/lib/structured-problem';
import { createStandaloneProblem, updateStandaloneProblem } from '../actions';
import { toast } from 'sonner';
import { CoreProblemSelector, SelectedCoreProblem } from './core-problem-selector';
import type { ProblemWithRelations } from '../types';

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
    videoUrl: string;
    videoStatus: VideoStatusValue;
    coreProblems: SelectedCoreProblem[];
};

function createInitialFormState(problem: ProblemWithRelations | null): ProblemFormState {
    return {
        question: getDisplayQuestionFromStructuredContent(problem?.publishedRevision?.structuredContent),
        answer: problem?.publishedRevision?.correctAnswer ?? '',
        grade: problem?.grade ?? '',
        videoUrl: problem?.videoUrl ?? '',
        videoStatus: ((problem?.videoStatus as VideoStatusValue | undefined) ?? 'NONE'),
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
                videoUrl: formData.videoUrl || undefined,
                videoStatus: resolveVideoStatusFromUrl(formData.videoStatus, formData.videoUrl),
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>{problem ? '問題の編集' : '新規問題作成'}</DialogTitle>
                <DialogDescription>
                    問題の内容と紐付けを設定します。
                </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 py-4">
                <div className="space-y-2">
                    <Label>問題文</Label>
                    <Textarea
                        required
                        value={formData.question}
                        onChange={(e) => setFormData((prev) => ({ ...prev, question: e.target.value }))}
                        placeholder="問題文を入力してください"
                        rows={3}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
                    <div className="space-y-2">
                        <Label>解説動画URL (任意)</Label>
                        <Input
                            value={formData.videoUrl}
                            onChange={(e) => setFormData((prev) => ({ ...prev, videoUrl: e.target.value }))}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>動画ステータス</Label>
                        <Select
                            value={resolveVideoStatusFromUrl(formData.videoStatus, formData.videoUrl)}
                            onValueChange={(value) => setFormData((prev) => ({ ...prev, videoStatus: value as VideoStatusValue }))}
                            disabled={!!formData.videoUrl.trim()}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VIDEO_STATUS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!!formData.videoUrl.trim() && (
                            <p className="text-xs text-muted-foreground">URL設定済みのため自動的に「設定済み」になります</p>
                        )}
                    </div>
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
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-11 sm:min-h-10">キャンセル</Button>
                    <Button type="submit" disabled={isPending} className="min-h-11 sm:min-h-10">
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
