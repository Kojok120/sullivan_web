'use client';

import { Problem } from '@prisma/client';
import { useState, useEffect } from 'react';
import { getProblemsByCoreProblem, createProblem, updateProblem, deleteProblem } from '../actions';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Video, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

import { useRouter } from 'next/navigation';

interface ProblemListProps {
    coreProblemId: string;
    subjectName: string;
}

export function ProblemList({ coreProblemId, subjectName }: ProblemListProps) {
    const [problems, setProblems] = useState<Problem[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Create/Edit State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProblem, setEditingProblem] = useState<Problem | null>(null);

    // Form State
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [grade, setGrade] = useState('');


    const fetchProblems = async () => {
        setLoading(true);
        const result = await getProblemsByCoreProblem(coreProblemId);
        if (result.success && result.problems) {
            setProblems(result.problems);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchProblems();
    }, [coreProblemId]);

    const openCreate = () => {
        setEditingProblem(null);
        setQuestion('');
        setAnswer('');
        setVideoUrl('');
        setGrade('');
        setIsDialogOpen(true);
    };

    const openEdit = (problem: Problem) => {
        setEditingProblem(problem);
        setQuestion(problem.question);
        setAnswer(problem.answer);
        setVideoUrl(problem.videoUrl || '');
        setGrade((problem as any).grade || '');

        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!question.trim() || !answer.trim()) {
            toast.error('問題文と解答は必須です');
            return;
        }

        if (editingProblem) {
            // Update
            const result = await updateProblem(editingProblem.id, {
                question,
                answer,
                videoUrl,
                grade,
            });
            if (result.success) {
                toast.success('問題を更新しました');
                setIsDialogOpen(false);
                fetchProblems();
            } else {
                toast.error('エラー', { description: result.error });
            }
        } else {
            // Create
            const maxOrder = problems.length > 0 ? Math.max(...problems.map(p => p.order)) : 0;
            const result = await createProblem({
                coreProblemId,
                question,
                answer,
                videoUrl,
                grade,
                order: maxOrder + 1,
            });
            if (result.success) {
                toast.success('問題を作成しました');
                setIsDialogOpen(false);
                fetchProblems();
            } else {
                toast.error('エラー', { description: result.error });
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('本当に削除しますか？')) return;
        const result = await deleteProblem(id);
        if (result.success) {
            toast.success('問題を削除しました');
            fetchProblems();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    if (loading) return <div className="text-sm text-muted-foreground">読み込み中...</div>;

    return (
        <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex justify-between items-center">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase">Problems</h5>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                        <a href={`/admin/curriculum/${coreProblemId}/bulk-add`}>
                            <FileSpreadsheet className="mr-2 h-3 w-3" /> 一括追加
                        </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={openCreate}>
                        <Plus className="mr-2 h-3 w-3" /> 問題追加
                    </Button>
                </div>
            </div>

            <div className="grid gap-4">
                {problems.map((problem) => (
                    <Card
                        key={problem.id}
                        className="bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer"
                        onClick={() => openEdit(problem)}
                    >
                        <CardContent className="p-4 flex items-start gap-4">
                            <div className="flex-1 space-y-2">
                                <div className="font-medium text-sm">{problem.question}</div>
                                <div className="text-xs text-muted-foreground">解答: {problem.answer}</div>
                                {problem.videoUrl && (
                                    <div className="flex items-center text-xs text-blue-600">
                                        <Video className="h-3 w-3 mr-1" /> 動画あり
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(problem.id);
                                    }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingProblem ? '問題編集' : '新規問題作成'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="question">問題文</Label>
                            <Textarea
                                id="question"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="answer">解答</Label>
                            <Input
                                id="answer"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="videoUrl">解説動画URL</Label>
                            <Input
                                id="videoUrl"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                placeholder="https://youtube.com/..."
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="grade">学年</Label>
                            <Input
                                id="grade"
                                value={grade}
                                onChange={(e) => setGrade(e.target.value)}
                                placeholder="例: 中1, 高2"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSave}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


        </div>
    );
}
