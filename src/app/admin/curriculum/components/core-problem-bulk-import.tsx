'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { bulkCreateCoreProblems } from '../actions';
import { toast } from 'sonner';

interface CoreProblemBulkImportProps {
    subjectId: string;
}

export function CoreProblemBulkImport({ subjectId }: CoreProblemBulkImportProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [rawText, setRawText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [parsedCount, setParsedCount] = useState(0);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setRawText(text);

        // Simple count preview
        const names = text.split('\n').map(l => l.trim()).filter(Boolean);
        setParsedCount(names.length);
    };

    const handleSubmit = async () => {
        const names = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        if (names.length === 0) {
            toast.error('登録するデータがありません');
            return;
        }

        setIsSubmitting(true);
        const result = await bulkCreateCoreProblems(subjectId, names);

        if (result.success) {
            if (result.warnings && result.warnings.length > 0) {
                toast.warning('一部スキップされました', { description: result.warnings.join('\n') });
            }
            toast.success(`${result.count}件のCoreProblemを登録しました`);
            setIsOpen(false);
            setRawText('');
            setParsedCount(0);
        } else {
            toast.error('一括登録エラー', { description: result.error });
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">一括登録</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>CoreProblem一括登録</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Alert>
                        <AlertDescription>
                            CoreProblem名を改行区切りで入力または貼り付けてください。<br />
                            既存のCoreProblemはスキップされます。
                        </AlertDescription>
                    </Alert>

                    <Textarea
                        placeholder={`CoreProblem A\nCoreProblem B\nCoreProblem C`}
                        className="h-64 font-mono text-sm whitespace-pre"
                        value={rawText}
                        onChange={handleTextChange}
                    />

                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                            {parsedCount}件検出
                        </span>
                        <Button onClick={handleSubmit} disabled={parsedCount === 0 || isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            登録実行
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
