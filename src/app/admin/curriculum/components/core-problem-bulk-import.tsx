'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check, Video } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bulkCreateCoreProblems, type LectureVideo } from '../actions';
import { toast } from 'sonner';
import { dedupeByCoreProblemName, normalizeCoreProblemName } from '@/lib/core-problem-import';

interface CoreProblemBulkImportProps {
    subjectId: string;
}

interface ParsedItem {
    name: string;
    lectureVideos: LectureVideo[];
    isValid: boolean;
}

export function CoreProblemBulkImport({ subjectId }: CoreProblemBulkImportProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
    const [isPending, startTransition] = useTransition();

    const handleParse = () => {
        if (!rawText.trim()) return;

        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

        // TSV形式をパース: 名前[TAB]タイトル1[TAB]URL1[TAB]タイトル2[TAB]URL2...
        const items: ParsedItem[] = lines.map(line => {
            const parts = line.split('\t');
            const name = normalizeCoreProblemName(parts[0] || '');

            // タイトルとURLのペアをパース
            const lectureVideos: LectureVideo[] = [];
            for (let i = 1; i < parts.length; i += 2) {
                const title = parts[i]?.trim();
                const url = parts[i + 1]?.trim();
                if (title && url) {
                    lectureVideos.push({ title, url });
                }
            }

            return {
                name,
                lectureVideos,
                isValid: name.length > 0,
            };
        });

        // 重複を除去（名前ベース）
        const uniqueItems = dedupeByCoreProblemName(items);

        setParsedData(uniqueItems.filter(i => i.isValid));
        setStep('preview');
    };

    const handleExecute = () => {
        if (parsedData.length === 0) return;

        startTransition(async () => {
            const items = parsedData.map(d => ({
                name: d.name,
                lectureVideos: d.lectureVideos.length > 0 ? d.lectureVideos : undefined,
            }));
            const result = await bulkCreateCoreProblems(subjectId, items);

            if (result.success) {
                if (result.warnings && result.warnings.length > 0) {
                    toast.warning(`${result.count}件登録しました（一部スキップ）`, {
                        description: result.warnings.join('\n')
                    });
                } else {
                    toast.success(`${result.count}件のCoreProblemを登録しました`);
                }
                setIsOpen(false);
                // Reset
                setStep('input');
                setRawText('');
                setParsedData([]);
            } else {
                toast.error('一括登録エラー', { description: result.error });
            }
        });
    };

    const totalVideoCount = parsedData.reduce((acc, d) => acc + d.lectureVideos.length, 0);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">一括登録</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>CoreProblem一括登録</DialogTitle>
                    <DialogDescription>
                        TSV形式: 名前[TAB]動画タイトル1[TAB]動画URL1[TAB]動画タイトル2[TAB]動画URL2...
                    </DialogDescription>
                </DialogHeader>

                {step === 'input' && (
                    <div className="space-y-4">
                        <Textarea
                            placeholder={`現在完了形\t導入編\thttps://youtu.be/xxxxx\t演習編\thttps://youtu.be/yyyyy\n過去分詞\t基礎\thttps://youtu.be/zzzzz\n関係代名詞`}
                            className="h-64 font-mono text-sm whitespace-pre"
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                        />
                        <div className="text-right text-sm text-muted-foreground">
                            {rawText.split('\n').filter(l => l.trim()).length}件
                        </div>
                    </div>
                )}

                {step === 'preview' && (
                    <div className="space-y-4">
                        <div className="max-h-[300px] overflow-auto border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">状態</TableHead>
                                        <TableHead>CoreProblem名</TableHead>
                                        <TableHead>講義動画</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((item, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Check className="w-4 h-4 text-green-500" />
                                            </TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="max-w-[300px]">
                                                {item.lectureVideos.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {item.lectureVideos.map((v, j) => (
                                                            <div key={j} className="flex items-center gap-1 text-xs text-blue-600">
                                                                <Video className="w-3 h-3 flex-shrink-0" />
                                                                <span className="truncate">{v.title}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">なし</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <Alert>
                            <AlertDescription>
                                ※ 同名のCoreProblemが既に存在する場合はスキップされます。
                                {totalVideoCount > 0 && ` 講義動画: 計${totalVideoCount}件`}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <DialogFooter>
                    {step === 'input' ? (
                        <Button onClick={handleParse} disabled={!rawText.trim()}>
                            プレビュー
                        </Button>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={() => setStep('input')}>戻る</Button>
                            <Button onClick={handleExecute} disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                登録実行 ({parsedData.length}件)
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
