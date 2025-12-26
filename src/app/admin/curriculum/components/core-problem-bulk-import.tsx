'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bulkCreateCoreProblems } from '../actions';
import { toast } from 'sonner';

interface CoreProblemBulkImportProps {
    subjectId: string;
}

interface ParsedItem {
    name: string;
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
        const uniqueNames = Array.from(new Set(lines)); // Client-side unique check

        const items: ParsedItem[] = uniqueNames.map(name => ({
            name,
            isValid: true, // Names are generally valid if not empty
        }));

        setParsedData(items);
        setStep('preview');
    };

    const handleExecute = () => {
        if (parsedData.length === 0) return;

        startTransition(async () => {
            const names = parsedData.map(d => d.name);
            const result = await bulkCreateCoreProblems(subjectId, names);

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

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">一括登録</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>CoreProblem一括登録</DialogTitle>
                    <DialogDescription>
                        CoreProblem名を改行区切りで入力してください。
                    </DialogDescription>
                </DialogHeader>

                {step === 'input' && (
                    <div className="space-y-4">
                        <Textarea
                            placeholder={`CoreProblem A\nCoreProblem B\nCoreProblem C`}
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
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((item, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Check className="w-4 h-4 text-green-500" />
                                            </TableCell>
                                            <TableCell>{item.name}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <Alert>
                            <AlertDescription>
                                ※ 同名のCoreProblemが既に存在する場合はスキップされます。
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
