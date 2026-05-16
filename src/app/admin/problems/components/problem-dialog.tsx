'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
    // problem-list.tsx と同じく publishedRevision が無い問題は最新 DRAFT で補う。
    // list 側で表示されているテキストが dialog で空になり、誤って空のまま保存され
    // 既存内容を上書きしてしまうのを防ぐ。
    const sourceRevision = problem?.publishedRevision ?? problem?.revisions?.[0] ?? null;
    return {
        question: getDisplayQuestionFromStructuredContent(sourceRevision?.structuredContent),
        answer: sourceRevision?.correctAnswer ?? '',
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
    const t = useTranslations('ProblemDialog');
    const [isPending, startTransition] = useTransition();
    const [initialFormData] = useState<ProblemFormState>(() => createInitialFormState(problem));
    const [formData, setFormData] = useState<ProblemFormState>(initialFormData);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            // 編集時は触っていないフィールドを送らない。
            // updateStandaloneProblem は question/answer/acceptedAnswers のいずれかが
            // 来ると publishedRevision.structuredContent を paragraph テキストで上書きするため、
            // 未変更のフィールドを送ると構造化ブロック (figure, directive, layout) を破壊する。
            const questionChanged = formData.question !== initialFormData.question;
            const answerChanged = formData.answer !== initialFormData.answer;

            if (problem) {
                const data: {
                    question?: string;
                    answer?: string;
                    grade?: string;
                    videoUrl?: string;
                    videoStatus: VideoStatusValue;
                    coreProblemIds: string[];
                } = {
                    grade: formData.grade || undefined,
                    videoUrl: formData.videoUrl || undefined,
                    videoStatus: resolveVideoStatusFromUrl(formData.videoStatus, formData.videoUrl),
                    coreProblemIds: formData.coreProblems.map((cp) => cp.id),
                };
                if (questionChanged) data.question = formData.question;
                if (answerChanged) data.answer = formData.answer;

                const result = await updateStandaloneProblem(problem.id, data);
                if (result.success) {
                    toast.success(t('updateSuccess'));
                    onSuccess();
                } else {
                    toast.error(result.error || t('saveFailed'));
                }
                return;
            }

            const data = {
                question: formData.question,
                answer: formData.answer,
                grade: formData.grade || undefined,
                videoUrl: formData.videoUrl || undefined,
                videoStatus: resolveVideoStatusFromUrl(formData.videoStatus, formData.videoUrl),
                coreProblemIds: formData.coreProblems.map((cp) => cp.id),
            };

            const result = await createStandaloneProblem(data);

            if (result.success) {
                toast.success(t('createSuccess'));
                onSuccess();
            } else {
                toast.error(result.error || t('saveFailed'));
            }
        });
    };

    return (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>{problem ? t('editTitle') : t('createTitle')}</DialogTitle>
                <DialogDescription>
                    {t('description')}
                </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 py-4">
                <div className="space-y-2">
                    <Label>{t('questionLabel')}</Label>
                    <Textarea
                        required
                        value={formData.question}
                        onChange={(e) => setFormData((prev) => ({ ...prev, question: e.target.value }))}
                        placeholder={t('questionPlaceholder')}
                        rows={3}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>{t('answerLabel')}</Label>
                        <Input
                            value={formData.answer}
                            onChange={(e) => setFormData((prev) => ({ ...prev, answer: e.target.value }))}
                            placeholder={t('answerPlaceholder')}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('gradeLabel')}</Label>
                        <Input
                            value={formData.grade}
                            onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
                            placeholder={t('gradePlaceholder')}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
                    <div className="space-y-2">
                        <Label>{t('videoUrlLabel')}</Label>
                        <Input
                            value={formData.videoUrl}
                            onChange={(e) => setFormData((prev) => ({ ...prev, videoUrl: e.target.value }))}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('videoStatusLabel')}</Label>
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
                                    <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!!formData.videoUrl.trim() && (
                            <p className="text-xs text-muted-foreground">{t('videoUrlAutoStatus')}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                    <Label>{t('coreProblemsLabel')}</Label>
                    <CoreProblemSelector
                        selected={formData.coreProblems}
                        onChange={(coreProblems) => setFormData((prev) => ({ ...prev, coreProblems }))}
                        active
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-11 sm:min-h-10">{t('cancel')}</Button>
                    <Button type="submit" disabled={isPending} className="min-h-11 sm:min-h-10">
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('save')}
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
