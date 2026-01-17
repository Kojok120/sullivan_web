'use client';

import { useState, useEffect, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Problem } from '@prisma/client';
import { createStandaloneProblem, updateStandaloneProblem } from '../actions';
import { getSubjects } from '../../curriculum/actions';
import { toast } from 'sonner';

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
    const [coreProblems, setCoreProblems] = useState<{ id: string, name?: string, subject?: { name: string } }[]>([]);

    const [subjects, setSubjects] = useState<{ id: string, name: string, coreProblems: { id: string, name: string }[] }[]>([]);

    useEffect(() => {
        if (open) {
            // Fetch subjects for the dropdown
            getSubjects().then(res => {
                if (res.success && res.subjects) {
                    setSubjects(res.subjects);
                }
            });

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



    const addCoreProblem = (cp: { id: string, name: string, subject: { name: string } }) => {
        if (!coreProblems.find(existing => existing.id === cp.id)) {
            setCoreProblems([...coreProblems, cp]);
        }
    };

    const removeCoreProblem = (id: string) => {
        setCoreProblems(coreProblems.filter(cp => cp.id !== id));
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

                        {/* Selected List */}
                        <div className="flex flex-wrap gap-2 mb-2 p-3 border rounded-md min-h-[50px] bg-muted/10">
                            {coreProblems.length === 0 && <span className="text-muted-foreground text-sm py-1">紐付けなし</span>}
                            {coreProblems.map(cp => (
                                <Badge key={cp.id} variant="secondary" className="flex items-center gap-1 pl-2 pr-1 py-1">
                                    <span>{cp.subject?.name || '??'} &gt; {cp.name || 'Unknown'}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeCoreProblem(cp.id)}
                                        className="rounded-full hover:bg-destructive hover:text-destructive-foreground p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>

                        {/* Select Add */}
                        <div className="flex gap-2">
                            <Select
                                onValueChange={(val) => {
                                    // Find the selected cp
                                    for (const subj of subjects) {
                                        const found = subj.coreProblems.find(cp => cp.id === val);
                                        if (found) {
                                            addCoreProblem({ id: found.id, name: found.name, subject: { name: subj.name } });
                                            break;
                                        }
                                    }
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="単元・コア問題を選択して追加" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {subjects.map((subject) => (
                                        <SelectGroup key={subject.id}>
                                            <SelectLabel className="sticky top-0 bg-background z-10">{subject.name}</SelectLabel>
                                            {subject.coreProblems && subject.coreProblems.length > 0 ? (
                                                subject.coreProblems.map((cp) => {
                                                    const isSelected = coreProblems.some(existing => existing.id === cp.id);
                                                    return (
                                                        <SelectItem
                                                            key={cp.id}
                                                            value={cp.id}
                                                            disabled={isSelected}
                                                            className="pl-6"
                                                        >
                                                            {cp.name} {isSelected && '(追加済)'}
                                                        </SelectItem>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-2 text-xs text-muted-foreground pl-6">問題なし</div>
                                            )}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
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
