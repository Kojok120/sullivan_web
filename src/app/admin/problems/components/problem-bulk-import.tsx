'use client';

import { useState, useTransition, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    subjects: { id: string; name: string }[];
    onSuccess: () => void;
}

const RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT = 24;

type ExistingProblemSnapshot = {
    question: string;
    answer: string | null;
    grade: string | null;
    videoUrl: string | null;
    coreProblems: { id: string }[];
};

type ResolvedCoreProblem = {
    id: string;
    name: string;
    subjectId: string;
    subject: { name: string };
};

type ParsedExistingProblem = {
    subjectId: string;
    masterNumber: number | null;
    question: string;
    answer: string | null;
    grade: string | null;
    videoUrl: string | null;
    coreProblems: { id: string }[];
};

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
    resolvedSubjectId?: string;
    existingProblem?: ExistingProblemSnapshot;
}

type RowDiffResult = {
    isQuestionChanged: boolean;
    isAnswerChanged: boolean;
    isGradeChanged: boolean;
    isVideoChanged: boolean;
    isCpChanged: boolean;
    hasChanges: boolean;
};

const AUTO_SUBJECT_VALUE = '__AUTO_SUBJECT__';

function makeSubjectMasterKey(subjectId: string, masterNumber: number): string {
    return `${subjectId}:${masterNumber}`;
}

function collectNewCoreProblemIds(
    row: Pick<ParsedProblem, 'coreProblemNames' | 'coreProblemName'>,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>
): Set<string> {
    const newIds = new Set<string>();

    selectedCoreProblems.forEach((cp) => {
        newIds.add(cp.id);
    });

    if (row.coreProblemNames && row.coreProblemNames.length > 0) {
        row.coreProblemNames.forEach((name) => {
            const resolved = resolvedCoreProblems.get(name);
            if (resolved) {
                newIds.add(resolved.id);
            }
        });
        return newIds;
    }

    if (row.coreProblemName) {
        const resolved = resolvedCoreProblems.get(row.coreProblemName);
        if (resolved) {
            newIds.add(resolved.id);
        }
    }

    return newIds;
}

function computeRowDiff(
    row: ParsedProblem,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>
): RowDiffResult {
    if (!row.existingProblem) {
        return {
            isQuestionChanged: false,
            isAnswerChanged: false,
            isGradeChanged: false,
            isVideoChanged: false,
            isCpChanged: false,
            hasChanges: true,
        };
    }

    const old = row.existingProblem;
    const isQuestionChanged = old.question !== row.question;
    const isAnswerChanged = (old.answer || '') !== (row.answer || '');
    const isGradeChanged = (old.grade || '') !== (row.grade || '');
    const isVideoChanged = (old.videoUrl || '') !== (row.videoUrl || '');

    const newIds = collectNewCoreProblemIds(row, selectedCoreProblems, resolvedCoreProblems);
    const oldIds = new Set(old.coreProblems.map((cp) => cp.id));
    const isCpChanged =
        newIds.size !== oldIds.size ||
        Array.from(newIds).some((id) => !oldIds.has(id));

    return {
        isQuestionChanged,
        isAnswerChanged,
        isGradeChanged,
        isVideoChanged,
        isCpChanged,
        hasChanges: isQuestionChanged || isAnswerChanged || isGradeChanged || isVideoChanged || isCpChanged,
    };
}

function resolveRowSubjectId(
    row: Pick<ParsedProblem, 'coreProblemNames' | 'coreProblemName'>,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>,
    fallbackSubjectId?: string
): string | undefined {
    const subjectIds = new Set<string>();

    for (const coreProblem of selectedCoreProblems) {
        if (coreProblem.subjectId) {
            subjectIds.add(coreProblem.subjectId);
        }
    }

    if (row.coreProblemNames && row.coreProblemNames.length > 0) {
        for (const name of row.coreProblemNames) {
            const resolved = resolvedCoreProblems.get(name);
            if (resolved?.subjectId) {
                subjectIds.add(resolved.subjectId);
            }
        }
    } else if (row.coreProblemName) {
        const resolved = resolvedCoreProblems.get(row.coreProblemName);
        if (resolved?.subjectId) {
            subjectIds.add(resolved.subjectId);
        }
    }

    if (subjectIds.size === 1) {
        return Array.from(subjectIds)[0];
    }
    if (subjectIds.size === 0) {
        return fallbackSubjectId;
    }
    return undefined;
}

export function BulkImportDialog({ open, onOpenChange, subjects, onSuccess }: BulkImportDialogProps) {
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawInput, setRawInput] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [lastWarnings, setLastWarnings] = useState<string[]>([]);
    const [showWarningsDialog, setShowWarningsDialog] = useState(false);
    const [showAllResolvedCoreProblems, setShowAllResolvedCoreProblems] = useState(false);

    // Shared CoreProblem selection
    const [coreProblems, setCoreProblems] = useState<SelectedCoreProblem[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState(AUTO_SUBJECT_VALUE);

    // Map of CoreProblem name -> CoreProblem data (auto-resolved)
    const [resolvedCoreProblems, setResolvedCoreProblems] = useState<Map<string, ResolvedCoreProblem>>(new Map());

    const visibleItems = useMemo(() => {
        return parsedData.filter((row) => {
            if (!row.existingProblem) {
                return true;
            }
            return computeRowDiff(row, coreProblems, resolvedCoreProblems).hasChanges;
        });
    }, [parsedData, coreProblems, resolvedCoreProblems]);

        const validItems = useMemo(() => visibleItems.filter(p => p.isValid), [visibleItems]);
    const validCount = validItems.length;
    const hasSubjectFallback = selectedSubjectId !== AUTO_SUBJECT_VALUE;
    const missingCoreProblemCount = useMemo(() => {
        return validItems.filter((row) => {
            const coreProblemIds = collectNewCoreProblemIds(row, coreProblems, resolvedCoreProblems);
            return coreProblemIds.size === 0;
        }).length;
    }, [validItems, coreProblems, resolvedCoreProblems]);
    const resolvedCoreProblemItems = useMemo(
        () => Array.from(resolvedCoreProblems.values()),
        [resolvedCoreProblems]
    );
    const visibleResolvedCoreProblemItems = useMemo(
        () =>
            showAllResolvedCoreProblems
                ? resolvedCoreProblemItems
                : resolvedCoreProblemItems.slice(0, RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT),
        [resolvedCoreProblemItems, showAllResolvedCoreProblems]
    );
    const hiddenResolvedCoreProblemCount = Math.max(
        0,
        resolvedCoreProblemItems.length - visibleResolvedCoreProblemItems.length
    );

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
        const newResolvedMap = new Map<string, ResolvedCoreProblem>();
        if (coreProblemNames.size > 0) {
            const { coreProblemsMap } = await bulkSearchCoreProblems(Array.from(coreProblemNames));
            if (coreProblemsMap) {
                for (const name of coreProblemNames) {
                    const resolved = coreProblemsMap[name];
                    if (resolved) {
                        newResolvedMap.set(name, resolved as ResolvedCoreProblem);
                    }
                }
            }
        }
        setResolvedCoreProblems(newResolvedMap);

        // [Upsert] Existing problems lookup
        const fallbackSubjectId = hasSubjectFallback ? selectedSubjectId : undefined;
        const lookupTargets = Array.from(
            new Map(
                parsed
                    .map((row) => {
                        if (typeof row.masterNumber !== 'number') {
                            return null;
                        }
                        const subjectId = resolveRowSubjectId(row, coreProblems, newResolvedMap, fallbackSubjectId);
                        if (!subjectId) {
                            return null;
                        }
                        return {
                            masterNumber: row.masterNumber,
                            subjectId,
                        };
                    })
                    .filter((target): target is { masterNumber: number; subjectId: string } => target !== null)
                    .map((target) => [makeSubjectMasterKey(target.subjectId, target.masterNumber), target])
            ).values()
        );

        const existingMap = new Map<string, ExistingProblemSnapshot>();
        if (lookupTargets.length > 0) {
            const { problems } = await searchProblemsByMasterNumbers(lookupTargets);
            if (problems) {
                const existingProblems = problems as ParsedExistingProblem[];
                existingProblems.forEach((problem) => {
                    if (problem.masterNumber === null) {
                        return;
                    }
                    existingMap.set(makeSubjectMasterKey(problem.subjectId, problem.masterNumber), {
                        question: problem.question,
                        answer: problem.answer,
                        grade: problem.grade,
                        videoUrl: problem.videoUrl,
                        coreProblems: problem.coreProblems,
                    });
                });
            }
        }

        // Attach existing data to parsed rows
        const enhancedParsed = parsed.map((row) => {
            const resolvedSubjectId = typeof row.masterNumber === 'number'
                ? resolveRowSubjectId(row, coreProblems, newResolvedMap, fallbackSubjectId)
                : undefined;
            return {
                ...row,
                resolvedSubjectId,
                existingProblem: (typeof row.masterNumber === 'number' && resolvedSubjectId)
                    ? existingMap.get(makeSubjectMasterKey(resolvedSubjectId, row.masterNumber))
                    : undefined
            };
        });

        setParsedData(enhancedParsed);
        setShowAllResolvedCoreProblems(false);
        setStep('preview');
    };

    const handleExecute = () => {
        if (validCount === 0) return;

        const fallbackSubjectId = hasSubjectFallback ? selectedSubjectId : undefined;

        startTransition(async () => {
            const problems = validItems.map((p) => {
                const coreProblemIds = Array.from(
                    collectNewCoreProblemIds(p, coreProblems, resolvedCoreProblems)
                );

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

            const result = await bulkUpsertStandaloneProblems(problems, { subjectId: fallbackSubjectId });

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
                setSelectedSubjectId(AUTO_SUBJECT_VALUE);
                setShowAllResolvedCoreProblems(false);
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
                <DialogContent className="!max-w-none w-[95vw] max-w-[95vw] h-[90dvh] max-h-[90dvh] grid grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden p-0">
                    <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-3">
                        <DialogTitle>問題の一括登録・更新</DialogTitle>
                        <DialogDescription>
                            Excelやスプレッドシートからコピー＆ペーストで一括登録・更新できます。<br />
                            マスタ内問題番号が既存の場合は更新、新規の場合は作成されます。
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'input' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <Alert>
                                <AlertTitle>フォーマット</AlertTitle>
                                <AlertDescription>
                                    タブ区切り: [マスタ内問題番号(任意)] [学年] [CoreProblem名] [問題文] [正解] [別解(任意)] [動画URL(任意)]
                                </AlertDescription>
                            </Alert>
                            <div className="space-y-2">
                                <Label htmlFor="bulk-import-subject">ID採番用の科目（任意）</Label>
                                <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                                    <SelectTrigger id="bulk-import-subject" className="w-full sm:w-[320px]">
                                        <SelectValue placeholder="科目を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={AUTO_SUBJECT_VALUE}>自動判定（CoreProblemから）</SelectItem>
                                        {subjects.map((subject) => (
                                            <SelectItem key={subject.id} value={subject.id}>
                                                {subject.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    CoreProblemから科目が判定できない行にのみ、この科目をID採番のフォールバックとして使います。
                                </p>
                            </div>
                            <Textarea
                                placeholder={`例:\n1001\t中1\tbe動詞の文_肯定文\t私は新入生です I (A) a new student.\tA: am\t\thttps://youtube.com/...`}
                                value={rawInput}
                                onChange={(e) => setRawInput(e.target.value)}
                                spellCheck={false}
                                className="field-sizing-fixed flex-1 min-h-0 w-full whitespace-pre overflow-auto font-mono text-sm leading-6 resize-none"
                            />
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <div className="space-y-3 p-3 border rounded bg-muted/10 shrink-0 max-h-[38dvh] overflow-y-auto">
                                <div className="space-y-2">
                                    <Label htmlFor="bulk-import-subject-preview">ID採番用の科目（任意）</Label>
                                    <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                                        <SelectTrigger id="bulk-import-subject-preview" className="w-full sm:w-[320px] bg-background">
                                            <SelectValue placeholder="科目を選択" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={AUTO_SUBJECT_VALUE}>自動判定（CoreProblemから）</SelectItem>
                                            {subjects.map((subject) => (
                                                <SelectItem key={subject.id} value={subject.id}>
                                                    {subject.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        CoreProblemから科目が判定できない行にのみ、この科目をID採番のフォールバックとして使います。
                                    </p>
                                </div>
                                {missingCoreProblemCount > 0 && (
                                    <Alert className="border-yellow-300 bg-yellow-50">
                                        <AlertTitle className="text-yellow-800">CoreProblem未設定の行があります</AlertTitle>
                                        <AlertDescription className="text-yellow-800">
                                            CoreProblem未解決の行が{missingCoreProblemCount}件あります。
                                            これらの行は実行時に警告され、作成・更新対象から自動でスキップされます。
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <Label>追加の紐付け設定 (一括)</Label>
                                <div className="text-sm text-muted-foreground mb-2">
                                    ペーストしたデータのCoreProblem列から自動で紐付けされます。追加で紐付けしたい場合は下で選択してください。
                                </div>

                                {/* Auto-resolved CoreProblems */}
                                {resolvedCoreProblems.size > 0 && (
                                    <div className="mb-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                自動検出されたコア問題: {resolvedCoreProblemItems.length}件
                                            </span>
                                            {resolvedCoreProblemItems.length > RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => setShowAllResolvedCoreProblems((prev) => !prev)}
                                                >
                                                    {showAllResolvedCoreProblems
                                                        ? '折りたたむ'
                                                        : `すべて表示 (+${hiddenResolvedCoreProblemCount})`}
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1 max-h-[140px] overflow-y-auto rounded border bg-background p-2">
                                            {visibleResolvedCoreProblemItems.map((cp) => (
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

                            <div className="border rounded-md flex-1 min-h-[220px] overflow-auto">
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
                                            const diff = computeRowDiff(row, coreProblems, resolvedCoreProblems);
                                            const hasNoCoreProblem =
                                                collectNewCoreProblemIds(row, coreProblems, resolvedCoreProblems).size === 0;
                                            const shouldHighlightAsError = !row.isValid || hasNoCoreProblem;

                                            return (
                                                <TableRow
                                                    key={i}
                                                    className={shouldHighlightAsError ? 'bg-red-50/80' : ''}
                                                >
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
                                                    <TableCell className={diff.isGradeChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}>{row.grade}</TableCell>
                                                    <TableCell className={`max-w-[150px] ${diff.isCpChanged ? 'bg-blue-50' : ''} ${hasNoCoreProblem ? 'text-red-700' : ''}`}>
                                                        {row.coreProblemNames && row.coreProblemNames.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {row.coreProblemNames.map((name) => {
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
                                                    <TableCell className={`max-w-[200px] truncate ${diff.isQuestionChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`} title={row.question}>{row.question}</TableCell>
                                                    <TableCell className={`max-w-[100px] truncate ${diff.isAnswerChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`} title={row.answer}>{row.answer}</TableCell>
                                                    <TableCell className="max-w-[80px] truncate">{row.acceptedAnswers?.join(', ')}</TableCell>
                                                    <TableCell className={`max-w-[80px] truncate ${diff.isVideoChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>{row.videoUrl}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="shrink-0 border-t bg-background px-6 py-3 z-10">
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
