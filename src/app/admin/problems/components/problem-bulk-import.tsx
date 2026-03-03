'use client';

import { Check, AlertTriangle, Loader2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { CoreProblemSelector } from './core-problem-selector';
import { collectNewCoreProblemIds, computeRowDiff } from './problem-bulk-import/diff';
import {
    AUTO_SUBJECT_VALUE,
    RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT,
    type BulkImportDialogProps,
} from './problem-bulk-import/types';
import { useProblemBulkImport } from './problem-bulk-import/use-problem-bulk-import';

export function BulkImportDialog({ open, onOpenChange, subjects, onSuccess }: BulkImportDialogProps) {
    const state = useProblemBulkImport({ onSuccess });

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

                    {state.step === 'input' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <Alert>
                                <AlertTitle>フォーマット</AlertTitle>
                                <AlertDescription>
                                    タブ区切り: [マスタ内問題番号(任意)] [学年] [CoreProblem名] [問題文] [正解] [別解(任意)] [動画URL(任意)]
                                </AlertDescription>
                            </Alert>
                            <div className="space-y-2">
                                <Label htmlFor="bulk-import-subject">ID採番用の科目（任意）</Label>
                                <Select value={state.selectedSubjectId} onValueChange={state.setSelectedSubjectId}>
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
                                value={state.rawInput}
                                onChange={(event) => state.setRawInput(event.target.value)}
                                spellCheck={false}
                                className="field-sizing-fixed flex-1 min-h-0 w-full whitespace-pre overflow-auto font-mono text-sm leading-6 resize-none"
                            />
                        </div>
                    )}

                    {state.step === 'preview' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <div className="space-y-3 p-3 border rounded bg-muted/10 shrink-0 max-h-[38dvh] overflow-y-auto">
                                <div className="space-y-2">
                                    <Label htmlFor="bulk-import-subject-preview">ID採番用の科目（任意）</Label>
                                    <Select value={state.selectedSubjectId} onValueChange={state.setSelectedSubjectId}>
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
                                {state.missingCoreProblemCount > 0 && (
                                    <Alert className="border-yellow-300 bg-yellow-50">
                                        <AlertTitle className="text-yellow-800">CoreProblem未設定の行があります</AlertTitle>
                                        <AlertDescription className="text-yellow-800">
                                            CoreProblem未解決の行が{state.missingCoreProblemCount}件あります。
                                            これらの行は実行時に警告され、作成・更新対象から自動でスキップされます。
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <Label>追加の紐付け設定 (一括)</Label>
                                <div className="text-sm text-muted-foreground mb-2">
                                    ペーストしたデータのCoreProblem列から自動で紐付けされます。追加で紐付けしたい場合は下で選択してください。
                                </div>

                                {state.resolvedCoreProblems.size > 0 && (
                                    <div className="mb-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                自動検出されたコア問題: {state.resolvedCoreProblemItems.length}件
                                            </span>
                                            {state.resolvedCoreProblemItems.length > RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => state.setShowAllResolvedCoreProblems(!state.showAllResolvedCoreProblems)}
                                                >
                                                    {state.showAllResolvedCoreProblems
                                                        ? '折りたたむ'
                                                        : `すべて表示 (+${state.hiddenResolvedCoreProblemCount})`}
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1 max-h-[140px] overflow-y-auto rounded border bg-background p-2">
                                            {state.visibleResolvedCoreProblemItems.map((coreProblem) => (
                                                <Badge key={coreProblem.id} variant="outline" className="text-xs">
                                                    {coreProblem.subject?.name} &gt; {coreProblem.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <CoreProblemSelector
                                    selected={state.coreProblems}
                                    onChange={state.setCoreProblems}
                                    active={open && state.step === 'preview'}
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
                                        {state.visibleItems.map((row, index) => {
                                            const isUpdate = !!row.existingProblem;
                                            const diff = computeRowDiff(row, state.coreProblems, state.resolvedCoreProblems);
                                            const hasNoCoreProblem =
                                                collectNewCoreProblemIds(row, state.coreProblems, state.resolvedCoreProblems).size === 0;
                                            const shouldHighlightAsError = !row.isValid || hasNoCoreProblem;

                                            return (
                                                <TableRow key={index} className={shouldHighlightAsError ? 'bg-red-50/80' : ''}>
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
                                                                    const isResolved = state.resolvedCoreProblems.has(name);
                                                                    return (
                                                                        <span
                                                                            key={name}
                                                                            className={`text-xs px-1 rounded border ${isResolved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                                                                        >
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
                                                    <TableCell
                                                        className={`max-w-[200px] truncate ${diff.isQuestionChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                                                        title={row.question}
                                                    >
                                                        {row.question}
                                                    </TableCell>
                                                    <TableCell
                                                        className={`max-w-[100px] truncate ${diff.isAnswerChanged ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                                                        title={row.answer}
                                                    >
                                                        {row.answer}
                                                    </TableCell>
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
                        {state.step === 'input' ? (
                            <Button onClick={state.handleParse} disabled={!state.rawInput.trim()}>
                                プレビュー
                            </Button>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => state.setStep('input')}>戻る</Button>
                                <Button onClick={state.handleExecute} disabled={state.isPending || state.validCount === 0}>
                                    {state.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    登録実行 ({state.validCount}件)
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={state.showWarningsDialog} onOpenChange={state.setShowWarningsDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>登録時の警告 ({state.lastWarnings.length}件)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {state.lastWarnings.map((warning, index) => (
                            <div key={index} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                {warning}
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => state.setShowWarningsDialog(false)}>閉じる</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
