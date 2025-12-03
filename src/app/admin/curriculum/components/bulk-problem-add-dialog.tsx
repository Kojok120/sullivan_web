'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { bulkCreateProblems } from '../actions';

interface BulkProblemAddDialogProps {
    isOpen: boolean;
    onClose: () => void;
    coreProblemId: string;
    onSuccess: () => void;
}

interface ParsedProblem {
    question: string;
    answer: string;
    videoUrl?: string;
    difficulty?: number;
}

export function BulkProblemAddDialog({ isOpen, onClose, coreProblemId, onSuccess }: BulkProblemAddDialogProps) {
    const [text, setText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');

    const handleParse = () => {
        const lines = text.trim().split('\n');
        const parsed: ParsedProblem[] = [];

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 2) continue;

            const [question, answer, videoUrl, difficultyStr] = parts;
            parsed.push({
                question: question.trim(),
                answer: answer.trim(),
                videoUrl: videoUrl?.trim() || undefined,
                difficulty: difficultyStr ? parseInt(difficultyStr.trim()) : 1,
            });
        }

        if (parsed.length === 0) {
            toast.error('有効なデータが見つかりませんでした');
            return;
        }

        setParsedData(parsed);
        setStep('preview');
    };

    const handleSave = async () => {
        const result = await bulkCreateProblems(coreProblemId, parsedData);
        if (result.success) {
            toast.success(`${parsedData.length}件の問題を作成しました`);
            onSuccess();
            onClose();
            setText('');
            setParsedData([]);
            setStep('input');
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>問題の一括追加</DialogTitle>
                </DialogHeader>

                {step === 'input' ? (
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                            <p>Excelやスプレッドシートからコピーして貼り付けてください。</p>
                            <p>形式: <strong>問題文 [TAB] 解答 [TAB] 動画URL(任意) [TAB] 難易度(任意)</strong></p>
                        </div>
                        <Textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={`問題1\t解答1\thttps://...\t1\n問題2\t解答2\t\t2`}
                            className="h-64 font-mono"
                        />
                        <DialogFooter>
                            <Button variant="outline" onClick={onClose}>キャンセル</Button>
                            <Button onClick={handleParse}>プレビュー</Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>No.</TableHead>
                                        <TableHead>問題文</TableHead>
                                        <TableHead>解答</TableHead>
                                        <TableHead>動画URL</TableHead>
                                        <TableHead>難易度</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((p, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{i + 1}</TableCell>
                                            <TableCell className="max-w-xs truncate" title={p.question}>{p.question}</TableCell>
                                            <TableCell>{p.answer}</TableCell>
                                            <TableCell className="max-w-xs truncate" title={p.videoUrl}>{p.videoUrl || '-'}</TableCell>
                                            <TableCell>{p.difficulty}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('input')}>戻る</Button>
                            <Button onClick={handleSave}>登録実行</Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
