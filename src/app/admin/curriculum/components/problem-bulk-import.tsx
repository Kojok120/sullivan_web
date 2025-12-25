'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { bulkCreateProblems } from '../actions';
import { toast } from 'sonner';
import { CoreProblem } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { parseProblemTSV } from '@/lib/tsv-parser';

interface ProblemBulkImportProps {
    coreProblems: CoreProblem[]; // All available CoreProblems
    subjectId: string;
}

type ParsedProblem = {
    grade: string;
    coreProblemNames: string[];
    question: string;
    answer: string;
    acceptedAnswers: string[];
    videoUrl: string;
    status: 'valid' | 'error';
    message?: string;
};

export function ProblemBulkImport({ coreProblems, subjectId }: ProblemBulkImportProps) {
    // Helper for validation
    const validateRow = (row: ParsedProblem, cpNameMap: Map<string, string>): ParsedProblem => {
        const cpNames = row.coreProblemNames;
        // Ensure cpNames is array
        const safeCpNames = Array.isArray(cpNames) ? cpNames : [];

        const missingCps = safeCpNames.filter(name => !cpNameMap.has(name));
        let status: 'valid' | 'error' = 'valid';
        let message = '';

        if (missingCps.length > 0) {
            status = 'error';
            message = `CoreProblemが見つかりません: ${missingCps.join(', ')}`;
        }
        if (!row.question || !row.answer) {
            status = 'error';
            message = message ? `${message}, 必須項目（問題・正答）が不足しています` : '必須項目（問題・正答）が不足しています';
        }

        return { ...row, status, message };
    };

    const [isOpen, setIsOpen] = useState(false);
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const cpNameMap = new Map(coreProblems.map(cp => [cp.name, cp.id]));

    // [TSV統一] Use shared parseProblemTSV with unified header detection and delimiter handling
    const parseProblemRows = (text: string) => {
        const rows = parseProblemTSV(text);

        return rows.map(row => {
            // Already parsed by parseProblemTSV
            const parsedRow: ParsedProblem = {
                grade: row.grade,
                coreProblemNames: row.coreProblemNames,
                question: row.question,
                answer: row.answer,
                acceptedAnswers: row.acceptedAnswers,
                videoUrl: row.videoUrl,
                status: 'valid',
            };

            return validateRow(parsedRow, cpNameMap);
        });
    };

    const handleParse = () => {
        const parsed = parseProblemRows(rawText);
        setParsedData(parsed);
    };

    const [warnings, setWarnings] = useState<string[]>([]);
    const [successCount, setSuccessCount] = useState<number | null>(null);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setWarnings([]);
        setSuccessCount(null);

        const validData = parsedData.filter(p => p.status === 'valid');
        if (validData.length === 0) {
            toast.error('登録可能なデータがありません');
            setIsSubmitting(false);
            return;
        }

        // We need to map CP names to IDs
        // And since one problem can have multiple CPs, we need to adjust the server action.
        // Current server action `bulkCreateProblems` takes `coreProblemId`.
        // We need a NEW server action `bulkCreateProblemsV2` or modify existing to accept `{ coreProblemIds: string[] }`.

        // Wait, `bulkCreateProblems` in actions.ts logic:
        // 1. Generate Custom ID using Prefix from Subject.
        // 2. Count existing problems in Subject.
        // 3. Create.

        // We can group by Subject? No, all items here are for THIS Subject (from props).
        // But `CoreProblem`s might arguably belong to *other* subjects?
        // No, assuming user stays within the subject page.
        // BUT, `CoreProblem` is `Subject` dependent.
        // The props `coreProblems` passed here must be from the current subject?
        // User said: "ProblemとCoreProblemは多対多の関係... Problemを一括で登録できるように...".
        // It implies we are in "Curriculum Management" for a Subject or Global?
        // The screen seems to be `SubjectDetail`.
        // So we strictly look up CPs in this Subject.

        const payload = validData.map(p => ({
            question: p.question,
            answer: p.answer,
            acceptedAnswers: p.acceptedAnswers,
            videoUrl: p.videoUrl,
            grade: p.grade,
            coreProblemIds: p.coreProblemNames.map(name => cpNameMap.get(name)!), // all valid here
        }));

        const result = await bulkCreateProblems(subjectId, payload);

        if (result.success) {
            setSuccessCount(result.count || 0);
            if (result.warnings && result.warnings.length > 0) {
                setWarnings(result.warnings);
                toast.warning('登録完了しましたが、重複警告があります');
            } else {
                toast.success(`${result.count}件の問題を登録しました`);
                setIsOpen(false);
                setRawText('');
                setParsedData([]);
            }
        } else {
            toast.error('登録エラー', { description: result.error });
        }
        setIsSubmitting(false);
    };

    const updateCell = (index: number, field: keyof ParsedProblem, value: any) => {
        const newData = [...parsedData];
        let row = { ...newData[index], [field]: value };

        // Re-validate if check fields changed
        if (field === 'coreProblemNames' || field === 'question' || field === 'answer') {
            row = validateRow(row, cpNameMap);
        }

        newData[index] = row;
        setParsedData(newData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                setWarnings([]);
                setSuccessCount(null);
                if (successCount !== null && warnings.length === 0) {
                    // Cleanup if closed after success
                    setRawText('');
                    setParsedData([]);
                }
            }
            setIsOpen(open);
        }}>
            <DialogTrigger asChild>
                <Button variant="outline">一括登録</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[95vw] h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>問題一括登録</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {successCount !== null && (
                        <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800">登録完了</AlertTitle>
                            <AlertDescription className="text-green-700">
                                {successCount}件の問題を登録しました。
                            </AlertDescription>
                        </Alert>
                    )}

                    {warnings.length > 0 && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>重複などの警告 ({warnings.length}件)</AlertTitle>
                            <AlertDescription>
                                <div className="mt-2 max-h-40 overflow-y-auto text-xs font-mono bg-destructive/5 p-2 rounded">
                                    {warnings.map((w, i) => (
                                        <div key={i} className="border-b border-destructive/10 last:border-0 py-1">
                                            {w}
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2">
                                    これら以外の問題は正常に登録されました。
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    {!parsedData.length && (
                        <div className="space-y-2">
                            <Alert>
                                <AlertDescription>
                                    Excelから以下のカラム順でコピー＆ペーストしてください。<br />
                                    学年 | CoreProblem | 問題文 | 正答 | 別解(カンマ区切り) | 動画URL
                                </AlertDescription>
                            </Alert>
                            <Textarea
                                placeholder="ここに貼り付け..."
                                className="h-64 font-mono text-sm whitespace-pre"
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                            />
                            <Button onClick={handleParse} disabled={!rawText}>プレビュー</Button>
                        </div>
                    )}


                    {parsedData.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-muted/20 p-2 rounded sticky top-0 z-10 backdrop-blur">
                                <span className="text-sm text-muted-foreground font-medium">
                                    {parsedData.length}件 (有効: {parsedData.filter(d => d.status === 'valid').length})
                                </span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setParsedData([])}>やり直す</Button>
                                    <Button onClick={handleSubmit} disabled={isSubmitting || parsedData.filter(d => d.status === 'valid').length === 0}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        登録実行
                                    </Button>
                                </div>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">状態</TableHead>
                                            <TableHead className="w-[80px]">学年</TableHead>
                                            <TableHead className="w-[200px]">CoreProblem</TableHead>
                                            <TableHead className="w-[300px]">問題文</TableHead>
                                            <TableHead className="w-[150px]">正答</TableHead>
                                            <TableHead className="w-[150px]">別解</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {parsedData.map((row, i) => (
                                            <TableRow key={i} className={row.status === 'error' ? 'bg-destructive/5' : ''}>
                                                <TableCell className="align-top py-2">
                                                    {row.status === 'valid' ?
                                                        <CheckCircle className="h-4 w-4 text-green-500 mt-2" /> :
                                                        <div className="text-destructive text-xs mt-2">
                                                            <AlertTriangle className="h-4 w-4 mb-1" />
                                                        </div>
                                                    }
                                                </TableCell>
                                                <TableCell className="align-top py-2">
                                                    <Input
                                                        value={row.grade}
                                                        onChange={e => updateCell(i, 'grade', e.target.value)}
                                                        className="h-8 text-xs"
                                                    />
                                                </TableCell>
                                                <TableCell className="align-top py-2">
                                                    <Textarea
                                                        value={row.coreProblemNames.join('\n')}
                                                        onChange={e => updateCell(i, 'coreProblemNames', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                                                        className={`min-h-[60px] text-xs font-mono ${row.status === 'error' && row.message?.includes('CoreProblem') ? 'border-destructive bg-destructive/10' : ''}`}
                                                        placeholder="改行区切り"
                                                    />
                                                    {row.status === 'error' && row.message?.includes('CoreProblem') && (
                                                        <p className="text-[10px] text-destructive mt-1">{row.message}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="align-top py-2">
                                                    <Textarea
                                                        value={row.question}
                                                        onChange={e => updateCell(i, 'question', e.target.value)}
                                                        className="min-h-[80px] text-xs"
                                                    />
                                                </TableCell>
                                                <TableCell className="align-top py-2">
                                                    <Input
                                                        value={row.answer}
                                                        onChange={e => updateCell(i, 'answer', e.target.value)}
                                                        className="h-8 text-xs"
                                                    />
                                                </TableCell>
                                                <TableCell className="align-top py-2">
                                                    <Input
                                                        value={row.acceptedAnswers.join(',')}
                                                        onChange={e => updateCell(i, 'acceptedAnswers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                                        className="h-8 text-xs"
                                                        placeholder="カンマ区切り"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
