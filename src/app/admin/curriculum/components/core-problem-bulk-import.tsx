'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, Loader2, Video } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bulkCreateCoreProblems, searchCoreProblemsForBulkUpsert, type LectureVideo } from '../actions';
import { parseCoreProblemTSV } from '@/lib/tsv-parser';
import { toast } from 'sonner';

interface CoreProblemBulkImportProps {
    subjectId: string;
}

type BulkRowStatus = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'SKIP';

type ExistingCoreProblem = {
    id: string;
    name: string;
    masterNumber: number;
    lectureVideos: unknown;
    order: number;
};

type ParsedItem = {
    rowNumber: number;
    masterNumberRaw: string;
    masterNumber?: number;
    name: string;
    lectureVideos: LectureVideo[];
    status: BulkRowStatus;
    warning?: string;
    existing?: ExistingCoreProblem;
};

function normalizeLectureVideos(videos: LectureVideo[]): LectureVideo[] {
    return videos
        .map((video) => ({
            title: video.title.trim(),
            url: video.url.trim(),
        }))
        .filter((video) => video.title.length > 0 && video.url.length > 0);
}

function parseLectureVideosFromJson(value: unknown): LectureVideo[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const videos: LectureVideo[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const title = typeof (entry as { title?: unknown }).title === 'string'
            ? (entry as { title: string }).title.trim()
            : '';
        const url = typeof (entry as { url?: unknown }).url === 'string'
            ? (entry as { url: string }).url.trim()
            : '';
        if (title && url) {
            videos.push({ title, url });
        }
    }

    return videos;
}

function areLectureVideosEqual(a: LectureVideo[], b: LectureVideo[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((video, index) => {
        const target = b[index];
        return target && video.title === target.title && video.url === target.url;
    });
}

function getStatusBadge(status: BulkRowStatus) {
    if (status === 'CREATE') {
        return <Badge variant="outline" className="bg-blue-50 text-blue-800 hover:bg-blue-50">新規</Badge>;
    }
    if (status === 'UPDATE') {
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">更新</Badge>;
    }
    if (status === 'UNCHANGED') {
        return <Badge variant="outline" className="bg-muted text-muted-foreground hover:bg-muted">変更なし</Badge>;
    }
    return <Badge variant="destructive">スキップ</Badge>;
}

export function CoreProblemBulkImport({ subjectId }: CoreProblemBulkImportProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [lastWarnings, setLastWarnings] = useState<string[]>([]);
    const [showWarningsDialog, setShowWarningsDialog] = useState(false);

    const stats = useMemo(() => {
        const result = {
            createCount: 0,
            updateCount: 0,
            unchangedCount: 0,
            skipCount: 0,
        };

        for (const row of parsedData) {
            if (row.status === 'CREATE') {
                result.createCount += 1;
            } else if (row.status === 'UPDATE') {
                result.updateCount += 1;
            } else if (row.status === 'UNCHANGED') {
                result.unchangedCount += 1;
            } else {
                result.skipCount += 1;
            }
        }

        return result;
    }, [parsedData]);

    const executableRows = useMemo(
        () => parsedData.filter((row) => row.status !== 'SKIP'),
        [parsedData]
    );

    const resetDialog = () => {
        setStep('input');
        setRawText('');
        setParsedData([]);
    };

    const handleParse = async () => {
        if (!rawText.trim()) {
            return;
        }

        const rows = parseCoreProblemTSV(rawText);
        if (rows.length === 0) {
            toast.error('有効なデータがありません');
            return;
        }

        const initialRows = rows.map((row, index) => {
            const name = row.name.trim();
            const lectureVideos = normalizeLectureVideos(row.lectureVideos);
            const hasNumericMaster = /^\d+$/.test(row.masterNumberRaw) && typeof row.masterNumber === 'number' && row.masterNumber > 0;
            const warning = !hasNumericMaster
                ? `行${index + 1}: マスタNoは1以上の整数で入力してください`
                : name.length === 0
                    ? `行${index + 1}: CoreProblem名は必須です`
                    : undefined;

            return {
                rowNumber: index + 1,
                masterNumberRaw: row.masterNumberRaw,
                masterNumber: hasNumericMaster ? row.masterNumber : undefined,
                name,
                lectureVideos,
                status: warning ? 'SKIP' : 'CREATE',
                warning,
            } as ParsedItem;
        });

        const seenMasterNumbers = new Set<number>();
        for (const row of initialRows) {
            if (row.status === 'SKIP' || typeof row.masterNumber !== 'number') {
                continue;
            }
            if (seenMasterNumbers.has(row.masterNumber)) {
                row.status = 'SKIP';
                row.warning = `行${row.rowNumber}: 同一TSV内でマスタNo ${row.masterNumber} が重複しています`;
                continue;
            }
            seenMasterNumbers.add(row.masterNumber);
        }

        const validRows = initialRows.filter((row) => row.status !== 'SKIP' && typeof row.masterNumber === 'number');
        const uniqueMasterNumbers = Array.from(new Set(validRows.map((row) => row.masterNumber!)));
        const uniqueNames = Array.from(new Set(validRows.map((row) => row.name)));

        const existingByMaster = new Map<number, ExistingCoreProblem>();
        const existingByName = new Map<string, ExistingCoreProblem[]>();

        if (uniqueMasterNumbers.length > 0 || uniqueNames.length > 0) {
            const result = await searchCoreProblemsForBulkUpsert(subjectId, uniqueMasterNumbers, uniqueNames);
            if ('error' in result) {
                toast.error(result.error || '既存CoreProblemの検索に失敗しました');
                return;
            }

            const existingRows = (result.coreProblems || []) as ExistingCoreProblem[];
            for (const existing of existingRows) {
                existingByMaster.set(existing.masterNumber, existing);
                const list = existingByName.get(existing.name) || [];
                list.push(existing);
                existingByName.set(existing.name, list);
            }
        }

        const usedByNameFallback = new Set<string>();
        const enhancedRows: ParsedItem[] = initialRows.map((row): ParsedItem => {
            if (row.status === 'SKIP' || typeof row.masterNumber !== 'number') {
                return row;
            }

            let target = existingByMaster.get(row.masterNumber);
            let warning = row.warning;

            if (!target) {
                const nameMatches = (existingByName.get(row.name) || []).filter((item) => !usedByNameFallback.has(item.id));
                if (nameMatches.length === 1) {
                    target = nameMatches[0];
                    usedByNameFallback.add(target.id);
                    warning = `行${row.rowNumber}: 同名既存CoreProblemを更新対象として扱います`;
                } else if (nameMatches.length > 1) {
                    return {
                        ...row,
                        status: 'SKIP' as const,
                        warning: `行${row.rowNumber}: 同名候補が複数あるため更新先を特定できません`,
                    };
                }
            }

            if (!target) {
                return { ...row, status: 'CREATE' as const };
            }

            const currentVideos = parseLectureVideosFromJson(target.lectureVideos);
            const changed =
                target.name !== row.name
                || target.masterNumber !== row.masterNumber
                || !areLectureVideosEqual(currentVideos, row.lectureVideos);

            return {
                ...row,
                status: (changed ? 'UPDATE' : 'UNCHANGED') as BulkRowStatus,
                warning,
                existing: target,
            };
        });

        setParsedData(enhancedRows);
        setStep('preview');
    };

    const handleExecute = () => {
        if (executableRows.length === 0) {
            return;
        }

        startTransition(async () => {
            const result = await bulkCreateCoreProblems(
                subjectId,
                executableRows
                    .filter((row) => typeof row.masterNumber === 'number')
                    .map((row) => ({
                        masterNumber: row.masterNumber!,
                        name: row.name,
                        lectureVideos: row.lectureVideos,
                    }))
            );

            if ('error' in result) {
                toast.error(result.error || '一括登録に失敗しました', {
                    style: { background: '#ef4444', color: 'white' },
                });
                return;
            }

            const created = result.createdCount ?? 0;
            const updated = result.updatedCount ?? 0;
            const unchanged = result.unchangedCount ?? 0;
            const skipped = result.skippedCount ?? 0;

            toast.success(
                `新規${created}件 / 更新${updated}件 / 変更なし${unchanged}件 / スキップ${skipped}件`,
                { style: { background: '#3b82f6', color: 'white' } }
            );

            if (result.warnings && result.warnings.length > 0) {
                setLastWarnings(result.warnings);
                setShowWarningsDialog(true);
                toast(`${result.warnings.length}件の警告があります`, {
                    style: { background: '#f59e0b', color: 'white' },
                    duration: 5000,
                });
            }

            setIsOpen(false);
            resetDialog();
        });
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            resetDialog();
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                    <Button variant="outline">一括登録</Button>
                </DialogTrigger>
                <DialogContent className="!max-w-none w-[95vw] max-w-[95vw] h-[90dvh] max-h-[90dvh] grid grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden p-0">
                    <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-3">
                        <DialogTitle>CoreProblem一括登録・更新</DialogTitle>
                        <DialogDescription>
                            Excelやスプレッドシートからコピー＆ペーストで一括登録・更新できます。<br />
                            同じマスタNoがある場合は内容差分に応じて更新、差分なしなら変更なしとして扱います。
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'input' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <Alert>
                                <AlertTitle>フォーマット</AlertTitle>
                                <AlertDescription>
                                    タブ区切り: [マスタNo] [CoreProblem] [動画タイトル1] [動画URL1] [動画タイトル2] [動画URL2] [動画タイトル3] [動画URL3]
                                </AlertDescription>
                            </Alert>
                            <Textarea
                                placeholder={`例:\n101\t現在完了形\t導入編\thttps://youtu.be/xxxxx\t演習編\thttps://youtu.be/yyyyy\n102\t過去分詞\t基礎\thttps://youtu.be/zzzzz`}
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                spellCheck={false}
                                className="field-sizing-fixed flex-1 min-h-0 w-full whitespace-pre overflow-auto font-mono text-sm leading-6 resize-none"
                            />
                            <div className="text-right text-sm text-muted-foreground">
                                {rawText.split('\n').filter((line) => line.trim().length > 0).length}行
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="min-h-0 flex h-full flex-col gap-4 overflow-hidden px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                <div className="p-2 border rounded bg-blue-50 text-blue-800">新規: {stats.createCount}件</div>
                                <div className="p-2 border rounded bg-orange-50 text-orange-800">更新: {stats.updateCount}件</div>
                                <div className="p-2 border rounded bg-muted text-muted-foreground">変更なし: {stats.unchangedCount}件</div>
                                <div className="p-2 border rounded bg-red-50 text-red-700">スキップ: {stats.skipCount}件</div>
                            </div>

                            {stats.skipCount > 0 && (
                                <Alert className="border-yellow-300 bg-yellow-50">
                                    <AlertTitle className="text-yellow-800">スキップ対象の行があります</AlertTitle>
                                    <AlertDescription className="text-yellow-800">
                                        スキップ行は登録対象外です。必要なら元データを修正して再プレビューしてください。
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="border rounded-md flex-1 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[56px]">状態</TableHead>
                                            <TableHead className="w-[110px]">タイプ</TableHead>
                                            <TableHead className="w-[100px]">マスタNo</TableHead>
                                            <TableHead className="min-w-[220px]">CoreProblem</TableHead>
                                            <TableHead className="min-w-[260px]">動画情報</TableHead>
                                            <TableHead className="min-w-[260px]">警告</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {parsedData.map((row) => {
                                            const isSkip = row.status === 'SKIP';
                                            const hasWarning = typeof row.warning === 'string' && row.warning.length > 0;
                                            return (
                                                <TableRow key={`${row.rowNumber}-${row.masterNumberRaw}-${row.name}`} className={isSkip ? 'bg-destructive/10' : ''}>
                                                    <TableCell>
                                                        {isSkip ? (
                                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                                        ) : (
                                                            <Check className="w-4 h-4 text-green-500" />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{getStatusBadge(row.status)}</TableCell>
                                                    <TableCell className="font-mono">{row.masterNumberRaw || '-'}</TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{row.name || '-'}</div>
                                                        {row.existing && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                既存: #{row.existing.masterNumber} / {row.existing.name}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {row.lectureVideos.length > 0 ? (
                                                            <div className="space-y-1">
                                                                {row.lectureVideos.map((video, index) => (
                                                                    <div key={`${video.url}-${index}`} className="flex items-center gap-1 text-xs text-blue-600">
                                                                        <Video className="w-3 h-3" />
                                                                        <span className="truncate">{video.title}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">なし（更新時は既存動画をクリア）</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {hasWarning ? (
                                                            <span className="text-xs text-amber-700">{row.warning}</span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
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
                            <Button onClick={handleParse} disabled={!rawText.trim()}>
                                プレビュー
                            </Button>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setStep('input')}>戻る</Button>
                                <Button onClick={handleExecute} disabled={isPending || executableRows.length === 0}>
                                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    登録実行 ({stats.createCount + stats.updateCount}件)
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showWarningsDialog} onOpenChange={setShowWarningsDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>登録時の警告 ({lastWarnings.length}件)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {lastWarnings.map((warning, index) => (
                            <div key={`${warning}-${index}`} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
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
