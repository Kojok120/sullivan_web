'use client';

import { useState, useTransition, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { bulkUpsertStandaloneProblems, bulkSearchCoreProblems, searchProblemsByMasterNumbers } from '../actions';
import { toast } from 'sonner';
import { parseProblemTSV } from '@/lib/tsv-parser';
import { CoreProblemSelector, SelectedCoreProblem } from './core-problem-selector';

interface BulkImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

interface ParsedProblem {
    masterNumber?: number;
    question: string;
    answer: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemName?: string;
    coreProblemNames?: string[];
    isValid: boolean;
    error?: string;
    existingProblem?: any;
}

export function BulkImportDialog({ open, onOpenChange, onSuccess }: BulkImportDialogProps) {
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawInput, setRawInput] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [lastWarnings, setLastWarnings] = useState<string[]>([]);
    const [showWarningsDialog, setShowWarningsDialog] = useState(false);

    // Shared CoreProblem selection
    const [coreProblems, setCoreProblems] = useState<SelectedCoreProblem[]>([]);

    // Map of CoreProblem name -> CoreProblem data (auto-resolved)
    const [resolvedCoreProblems, setResolvedCoreProblems] = useState<Map<string, { id: string, name: string, subject: { name: string } }>>(new Map());

    const visibleItems = useMemo(() => {
        return parsedData.filter(row => {
            const isUpdate = !!row.existingProblem;
            // New items are always visible
            if (!isUpdate) return true;

            const old = row.existingProblem;

            // Diff checks
            const isQuestionChanged = old.question !== row.question;
            const isAnswerChanged = (old.answer || '') !== (row.answer || '');
            const isGradeChanged = (old.grade || '') !== (row.grade || '');
            // const isVideoChanged = (old.videoUrl || '') !== (row.videoUrl || ''); // Video URL comparison strictly?
            // Handle null/empty string normalization for videoUrl
            const oldVideo = old.videoUrl || '';
            const newVideo = row.videoUrl || '';
            const isVideoChanged = oldVideo !== newVideo;

            // Core problem diff logic
            let isCpChanged = false;
            const newIds = new Set<string>();
            // Add manual selections
            coreProblems.forEach(cp => newIds.add(cp.id));

            // Add row specific resolved
            if (row.coreProblemNames) {
                row.coreProblemNames.forEach(name => {
                    const resolved = resolvedCoreProblems.get(name);
                    if (resolved) newIds.add(resolved.id);
                });
            } else if (row.coreProblemName) {
                const resolved = resolvedCoreProblems.get(row.coreProblemName);
                if (resolved) newIds.add(resolved.id);
            }

            const oldIds = new Set(old.coreProblems.map((cp: any) => cp.id));

            if (newIds.size !== oldIds.size) isCpChanged = true;
            else {
                for (const id of newIds) {
                    if (!oldIds.has(id)) {
                        isCpChanged = true;
                        break;
                    }
                }
            }

            return isQuestionChanged || isAnswerChanged || isGradeChanged || isVideoChanged || isCpChanged;
        });
    }, [parsedData, coreProblems, resolvedCoreProblems]);

    const validItems = useMemo(() => visibleItems.filter(p => p.isValid), [visibleItems]);
    const validCount = validItems.length;

    // parseTSV is now imported from @/lib/tsv-parser

    const handleParse = async () => {
        if (!rawInput.trim()) return;

        // [TSV統一] Use shared parseProblemTSV with unified header detection and delimiter handling
        const rows = parseProblemTSV(rawInput);

        const coreProblemNames = new Set<string>();

        const parsed = rows.map(row => {
            const isValid = !!row.question;
            const error = !isValid ? '問題文は必須です' : undefined;

            // Collect all CoreProblem names for bulk resolution
            for (const name of row.coreProblemNames) {
                coreProblemNames.add(name);
            }

            return {
                masterNumber: row.masterNumber,
                question: row.question,
                answer: row.answer,
                acceptedAnswers: row.acceptedAnswers.length > 0 ? row.acceptedAnswers : undefined,
                grade: row.grade,
                videoUrl: row.videoUrl,
                coreProblemName: row.coreProblemName,
                coreProblemNames: row.coreProblemNames,
                isValid,
                error
            };
        });

        // [N+1 解消] Try to resolve CoreProblem names to IDs with bulk search
        const newResolvedMap = new Map<string, { id: string, name: string, subject: { name: string } }>();
        if (coreProblemNames.size > 0) {
            const { coreProblemsMap } = await bulkSearchCoreProblems(Array.from(coreProblemNames));
            if (coreProblemsMap) {
                for (const name of coreProblemNames) {
                    const resolved = coreProblemsMap[name];
                    if (resolved) {
                        newResolvedMap.set(name, resolved as any);
                    }
                }
            }
        }
        setResolvedCoreProblems(newResolvedMap);

        // [Upsert] Existing problems lookup
        const masterNumbers = parsed.map(p => p.masterNumber).filter((n): n is number => n !== undefined && n !== null);
        const uniqueMasterNumbers = Array.from(new Set(masterNumbers));

        let existingMap = new Map<number, any>();
        if (uniqueMasterNumbers.length > 0) {
            const { problems } = await searchProblemsByMasterNumbers(uniqueMasterNumbers);
            if (problems) {
                problems.forEach((p: any) => existingMap.set(p.masterNumber!, p));
            }
        }

        // Attach existing data to parsed rows
        const enhancedParsed = parsed.map(p => ({
            ...p,
            existingProblem: p.masterNumber ? existingMap.get(p.masterNumber) : undefined
        }));

        setParsedData(enhancedParsed);
        setStep('preview');
    };

    const handleExecute = () => {
        if (validCount === 0) return;

        startTransition(async () => {
            const problems = validItems.map(p => {
                // Determine CoreProblem IDs
                const coreProblemIds: string[] = [];

                // Add manually selected CoreProblems
                coreProblems.forEach(cp => coreProblemIds.push(cp.id));

                // Add auto-resolved CoreProblems from the row
                if (p.coreProblemNames && p.coreProblemNames.length > 0) {
                    p.coreProblemNames.forEach(name => {
                        const resolved = resolvedCoreProblems.get(name);
                        if (resolved && !coreProblemIds.includes(resolved.id)) {
                            coreProblemIds.push(resolved.id);
                        }
                    });
                } else if (p.coreProblemName) {
                    // Fallback for singular
                    const resolved = resolvedCoreProblems.get(p.coreProblemName);
                    if (resolved && !coreProblemIds.includes(resolved.id)) {
                        coreProblemIds.push(resolved.id);
                    }
                }

                return {
                    masterNumber: p.masterNumber,
                    question: p.question,
                    answer: p.answer,
                    acceptedAnswers: p.acceptedAnswers,
                    grade: p.grade,
                    videoUrl: p.videoUrl,
                    coreProblemIds
                };
            });

            const result = await bulkUpsertStandaloneProblems(problems);

            if (result.success) {
                toast.success(`${result.createdCount}件作成、${result.updatedCount}件更新しました`, {
                    style: { background: '#3b82f6', color: 'white' }
                });
                if (result.warnings && result.warnings.length > 0) {
                    setLastWarnings(result.warnings);
                    setShowWarningsDialog(true);
                    toast(`${result.warnings.length}件の警告があります`, {
                        style: { background: '#f59e0b', color: 'white' },
                        duration: 5000,
                    });
                }
                onSuccess();
                // Reset
                setStep('input');
                setRawInput('');
                setParsedData([]);
                setCoreProblems([]);
                setResolvedCoreProblems(new Map());
            } else {
                toast.error(result.error || '登録に失敗しました', {
                    style: { background: '#ef4444', color: 'white' }
                });
            }
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="!max-w-none w-[95vw] h-[90vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>問題の一括登録・更新</DialogTitle>
                        <DialogDescription>
                            Excelやスプレッドシートからコピー＆ペーストで一括登録・更新できます。<br />
                            マスタ内問題番号が既存の場合は更新、新規の場合は作成されます。
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'input' && (
                        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                            <Alert>
                                <AlertTitle>フォーマット</AlertTitle>
                                <AlertDescription>
                                    タブ区切り: [マスタ内問題番号(任意)] [学年] [CoreProblem名] [問題文] [正解] [別解(任意)] [動画URL(任意)]
                                </AlertDescription>
                            </Alert>
                            <Textarea
                                placeholder={`例:\n1001\t中1\tbe動詞の文_肯定文\t私は新入生です I (A) a new student.\tA: am\t\thttps://youtube.com/...`}
                                value={rawInput}
                                onChange={(e) => setRawInput(e.target.value)}
                                className="font-mono text-sm flex-1 min-h-[300px]"
                            />
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                            <div className="space-y-3 p-3 border rounded bg-muted/10">
                                <Label>追加の紐付け設定 (一括)</Label>
                                <div className="text-sm text-muted-foreground mb-2">
                                    ペーストしたデータのCoreProblem列から自動で紐付けされます。追加で紐付けしたい場合は下で選択してください。
                                </div>

                                {/* Auto-resolved CoreProblems */}
                                {resolvedCoreProblems.size > 0 && (
                                    <div className="mb-2">
                                        <span className="text-xs text-muted-foreground">自動検出されたコア問題:</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {Array.from(resolvedCoreProblems.entries()).map(([name, cp]) => (
                                                <Badge key={cp.id} variant="outline" className="text-xs">
                                                    {cp.subject?.name} &gt; {cp.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <CoreProblemSelector
                                    selected={coreProblems}
                                    onChange={setCoreProblems}
                                    active={open && step === 'preview'}
                                    emptyText="追加の紐付けなし"
                                    placeholder="単元・コア問題を選択して追加"
                                />
                            </div>

                            <div className="border rounded-md flex-1 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">状態</TableHead>
                                            <TableHead>タイプ</TableHead>
                                            <TableHead>マスタNo</TableHead>
                                            <TableHead>学年</TableHead>
                                            <TableHead>コア問題</TableHead>
                                            <TableHead>問題文</TableHead>
                                            <TableHead>解答(任意)</TableHead>
                                            <TableHead>別解</TableHead>
                                            <TableHead>動画URL</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {visibleItems.map((row, i) => {
                                            const isUpdate = !!row.existingProblem;
                                            const old = row.existingProblem;

                                            // Diff checks (Re-calculate for highlighting, or extracted?)
                                            // Since we already filtered, we know if it's update, it MUST have changes.
                                            // But we still need to know WHICH fields changed for highlighting.

                                            let isQuestionChanged = false;
                                            let isAnswerChanged = false;
                                            let isGradeChanged = false;
                                            let isVideoChanged = false;
                                            let isCpChanged = false;

                                            if (isUpdate) {
                                                isQuestionChanged = old.question !== row.question;
                                                isAnswerChanged = (old.answer || '') !== (row.answer || '');
                                                isGradeChanged = (old.grade || '') !== (row.grade || '');
                                                const oldVideo = old.videoUrl || '';
                                                const newVideo = row.videoUrl || '';
                                                isVideoChanged = oldVideo !== newVideo;

                                                const newIds = new Set<string>();
                                                coreProblems.forEach(cp => newIds.add(cp.id));
                                                if (row.coreProblemNames) {
                                                    row.coreProblemNames.forEach(name => {
                                                        const resolved = resolvedCoreProblems.get(name);
                                                        if (resolved) newIds.add(resolved.id);
                                                    });
                                                } else if (row.coreProblemName) {
                                                    const resolved = resolvedCoreProblems.get(row.coreProblemName);
                                                    if (resolved) newIds.add(resolved.id);
                                                }

                                                const oldIds = new Set(old.coreProblems.map((cp: any) => cp.id));
                                                if (newIds.size !== oldIds.size) isCpChanged = true;
                                                else {
                                                    for (const id of newIds) {
                                                        if (!oldIds.has(id)) {
                                                            isCpChanged = true;
                                                            break;
                                                        }
                                                    }
                                                }
                                            }

                                            return (
                                                <TableRow key={i} className={!row.isValid ? 'bg-destructive/10' : ''}>
                                                    <TableCell>
                                                        {row.isValid ? (
                                                            <Check className="w-4 h-4 text-green-500" />
                                                        ) : (
                                                            <span title={row.error}>
                                                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {isUpdate ? (
                                                            <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">更新</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-blue-50 text-blue-800 hover:bg-blue-50">新規</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono">{row.masterNumber || '-'}</TableCell>
                                                    <TableCell className={isGradeChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}>{row.grade}</TableCell>
                                                    <TableCell className={`max-w-[150px] ${isCpChanged ? 'bg-blue-50' : ''}`}>
                                                        {row.coreProblemNames && row.coreProblemNames.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {row.coreProblemNames.map(name => {
                                                                    const isResolved = resolvedCoreProblems.has(name);
                                                                    return (
                                                                        <span key={name} className={`text-xs px-1 rounded border ${isResolved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                                                            {name}
                                                                            {!isResolved && ' (?)'}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            row.coreProblemName || '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell className={`max-w-[200px] truncate ${isQuestionChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`} title={row.question}>{row.question}</TableCell>
                                                    <TableCell className={`max-w-[100px] truncate ${isAnswerChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`} title={row.answer}>{row.answer}</TableCell>
                                                    <TableCell className="max-w-[80px] truncate">{row.acceptedAnswers?.join(', ')}</TableCell>
                                                    <TableCell className={`max-w-[80px] truncate ${isVideoChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>{row.videoUrl}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {step === 'input' ? (
                            <Button onClick={handleParse} disabled={!rawInput.trim()}>
                                プレビュー
                            </Button>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setStep('input')}>戻る</Button>
                                <Button onClick={handleExecute} disabled={isPending || validCount === 0}>
                                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    登録実行 ({validCount}件)
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Warnings Dialog */}
            <Dialog open={showWarningsDialog} onOpenChange={setShowWarningsDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>登録時の警告 ({lastWarnings.length}件)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {lastWarnings.map((warning, i) => (
                            <div key={i} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                {warning}
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowWarningsDialog(false)}>閉じる</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
