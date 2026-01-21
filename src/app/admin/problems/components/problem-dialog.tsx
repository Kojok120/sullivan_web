'use client';

import { useState, useEffect, useTransition } from 'react';
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

export function ProblemDialog({ open, onOpenChange, problem, onSuccess }: ProblemDialogProps) {
    const [isPending, startTransition] = useTransition();

    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [grade, setGrade] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [coreProblems, setCoreProblems] = useState<SelectedCoreProblem[]>([]);

    useEffect(() => {
        if (open) {
            if (problem) {
                setQuestion(problem.question);
                setAnswer(problem.answer || '');
                setGrade(problem.grade || '');
                setVideoUrl(problem.videoUrl || '');
                setCoreProblems(problem.coreProblems || []);
            } else {
                // Reset
                setQuestion('');
                setAnswer('');
                setGrade('');
                setVideoUrl('');
                setCoreProblems([]);
            }
        }
    }, [open, problem]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const data = {
                question,
                answer,
                grade: grade || undefined,
                videoUrl: videoUrl || undefined,
                coreProblemIds: coreProblems.map(cp => cp.id),
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                            value={question}
                            onChange={e => setQuestion(e.target.value)}
                            placeholder="問題文を入力してください"
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>解答 (任意)</Label>
                            <Input
                                value={answer}
                                onChange={e => setAnswer(e.target.value)}
                                placeholder="解答 (空欄可)"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>学年 (任意)</Label>
                            <Input
                                value={grade}
                                onChange={e => setGrade(e.target.value)}
                                placeholder="例: 中1"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>解説動画URL (任意)</Label>
                        <Input
                            value={videoUrl}
                            onChange={e => setVideoUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    {/* Core Problem Association Section */}
                    <div className="space-y-3 pt-4 border-t">
                        <Label>紐付け（コア問題・単元）</Label>
                        <CoreProblemSelector
                            selected={coreProblems}
                            onChange={setCoreProblems}
                            active={open}
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
        </Dialog>
    );
}
