'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { bulkCreateProblems } from '../actions';
import Papa from 'papaparse';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import Link from 'next/link';

interface BulkProblemEditorProps {
    coreProblemId: string;
    subjectName: string;
}

interface ParsedProblem {
    question: string;
    answer: string;
    acceptedAnswers?: string; // Comma separated string for editing
    videoUrl?: string;
    grade?: string;
    attributes?: any;
}

export function BulkProblemEditor({ coreProblemId, subjectName }: BulkProblemEditorProps) {
    const [text, setText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();

    const isEnglish = subjectName === '英語';

    const handleParse = () => {
        if (!text.trim()) {
            toast.error('テキストを入力してください');
            return;
        }

        Papa.parse(text.trim(), {
            delimiter: '\t',
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed: ParsedProblem[] = [];
                const data = results.data as string[][];

                for (const row of data) {
                    if (row.length < 2) continue;

                    // New Order:
                    // 0: Grade
                    // 1: Question
                    // 2: Answer
                    // 3: Accepted Answers (comma separated)
                    // 4: Video URL
                    // 5: Sentence Type
                    // 6: Verb System
                    // 7: Grammar Element
                    // 8: Syntax (Structure)
                    // 9: Additional Element

                    const grade = row[0]?.trim() || undefined;
                    const question = row[1]?.trim() || '';
                    const answer = row[2]?.trim() || '';
                    const acceptedAnswers = row[3]?.trim() || undefined;
                    const videoUrl = row[4]?.trim() || undefined;

                    let attributes: any = undefined;
                    if (isEnglish) {
                        attributes = {
                            sentenceType: row[5]?.trim() || undefined,
                            verbSystem: row[6]?.trim() || undefined,
                            grammarElement: row[7]?.trim() || undefined,
                            structure: row[8]?.trim() || undefined,
                            additionalElement: row[9]?.trim() || undefined,
                        };
                    }

                    parsed.push({
                        question,
                        answer,
                        acceptedAnswers,
                        videoUrl,
                        grade,
                        attributes,
                    });
                }

                if (parsed.length === 0) {
                    toast.error('有効なデータが見つかりませんでした');
                    return;
                }

                setParsedData(parsed);
                setStep('preview');
            },
            error: (error: any) => {
                console.error(error);
                toast.error('パースに失敗しました');
            }
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        // Convert acceptedAnswers string to array
        const problemsToSave = parsedData.map(p => ({
            ...p,
            acceptedAnswers: p.acceptedAnswers
                ? p.acceptedAnswers.split(',').map(s => s.trim()).filter(s => s !== '')
                : [],
            difficulty: 1 // Default difficulty
        }));

        const result = await bulkCreateProblems(coreProblemId, problemsToSave);
        setIsSaving(false);

        if (result.success) {
            toast.success(`${parsedData.length}件の問題を作成しました`);
            router.push('/admin/curriculum');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    const updateCell = (index: number, field: keyof ParsedProblem | string, value: any) => {
        const newData = [...parsedData];
        if (field.startsWith('attr.')) {
            const attrKey = field.split('.')[1];
            if (!newData[index].attributes) newData[index].attributes = {};
            newData[index].attributes[attrKey] = value;
        } else {
            (newData[index] as any)[field] = value;
        }
        setParsedData(newData);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/curriculum">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">問題一括追加</h1>
                    <p className="text-muted-foreground">
                        ExcelやGoogle Sheetsからコピー＆ペーストして問題を一括登録します。
                    </p>
                </div>
            </div>

            {step === 'input' ? (
                <div className="space-y-4">
                    <div className="bg-muted/50 p-4 rounded-md text-sm space-y-2">
                        <p className="font-medium">入力フォーマット（タブ区切り）:</p>
                        {isEnglish ? (
                            <code className="block bg-background p-2 rounded border">
                                学年 [TAB] 問題文 [TAB] 正答 [TAB] 別解(カンマ区切り) [TAB] 動画URL [TAB] 文種 [TAB] 動詞システム(複数可) [TAB] 文法要素(複数可) [TAB] 構文 [TAB] 付加要素(複数可)
                            </code>
                        ) : (
                            <code className="block bg-background p-2 rounded border">
                                学年 [TAB] 問題文 [TAB] 正答 [TAB] 別解(カンマ区切り) [TAB] 動画URL
                            </code>
                        )}
                        <p className="text-muted-foreground text-xs">
                            ※ Excelやスプレッドシートのセルをそのままコピーして貼り付けてください。<br />
                            ※ セル内の改行も正しく処理されます。
                        </p>
                    </div>

                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="ここに貼り付け..."
                        className="min-h-[400px] font-mono whitespace-pre"
                    />

                    <div className="flex justify-end">
                        <Button onClick={handleParse} size="lg">
                            <Upload className="mr-2 h-4 w-4" />
                            プレビューへ進む
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead className="w-[80px]">学年</TableHead>
                                    <TableHead className="min-w-[200px]">問題</TableHead>
                                    <TableHead className="min-w-[150px]">正答</TableHead>
                                    <TableHead className="min-w-[150px]">別解</TableHead>
                                    <TableHead className="min-w-[150px]">動画URL</TableHead>
                                    {isEnglish && (
                                        <>
                                            <TableHead className="min-w-[100px]">文種</TableHead>
                                            <TableHead className="min-w-[100px]">動詞システム</TableHead>
                                            <TableHead className="min-w-[100px]">文法要素</TableHead>
                                            <TableHead className="min-w-[100px]">構文</TableHead>
                                            <TableHead className="min-w-[100px]">付加要素</TableHead>
                                        </>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedData.map((p, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell>
                                            <Input
                                                value={p.grade || ''}
                                                onChange={(e) => updateCell(i, 'grade', e.target.value)}
                                                className="w-16"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Textarea
                                                value={p.question}
                                                onChange={(e) => updateCell(i, 'question', e.target.value)}
                                                className="min-h-[60px]"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={p.answer}
                                                onChange={(e) => updateCell(i, 'answer', e.target.value)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={p.acceptedAnswers || ''}
                                                onChange={(e) => updateCell(i, 'acceptedAnswers', e.target.value)}
                                                placeholder="カンマ区切り"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={p.videoUrl || ''}
                                                onChange={(e) => updateCell(i, 'videoUrl', e.target.value)}
                                                placeholder="https://..."
                                            />
                                        </TableCell>
                                        {isEnglish && (
                                            <>
                                                <TableCell><Input value={p.attributes?.sentenceType || ''} onChange={(e) => updateCell(i, 'attr.sentenceType', e.target.value)} /></TableCell>
                                                <TableCell><Input value={p.attributes?.verbSystem || ''} onChange={(e) => updateCell(i, 'attr.verbSystem', e.target.value)} /></TableCell>
                                                <TableCell><Input value={p.attributes?.grammarElement || ''} onChange={(e) => updateCell(i, 'attr.grammarElement', e.target.value)} /></TableCell>
                                                <TableCell><Input value={p.attributes?.structure || ''} onChange={(e) => updateCell(i, 'attr.structure', e.target.value)} /></TableCell>
                                                <TableCell><Input value={p.attributes?.additionalElement || ''} onChange={(e) => updateCell(i, 'attr.additionalElement', e.target.value)} /></TableCell>
                                            </>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex justify-between">
                        <Button variant="outline" onClick={() => setStep('input')}>
                            戻って修正
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} size="lg">
                            <Save className="mr-2 h-4 w-4" />
                            {parsedData.length}件を登録
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
