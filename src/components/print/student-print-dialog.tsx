'use client';

import { useState } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Printer, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Subject {
    subjectId: string;
    subjectName: string;
}

interface StudentPrintDialogProps {
    subjects: Subject[];
}

export function StudentPrintDialog({ subjects }: StudentPrintDialogProps) {
    const [open, setOpen] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handlePrint = () => {
        if (!selectedSubjectId) return;
        setLoading(true);
        router.push(`/dashboard/print?subjectId=${selectedSubjectId}`);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Printer className="h-4 w-4" />
                    問題を印刷する
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>問題を印刷</DialogTitle>
                    <DialogDescription>
                        印刷したい科目を選択してください。
                        苦手な問題や復習が必要な問題を自動的にピックアップしてPDFを作成します。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                            <SelectTrigger>
                                <SelectValue placeholder="科目を選択" />
                            </SelectTrigger>
                            <SelectContent>
                                {subjects.map((subject) => (
                                    <SelectItem key={subject.subjectId} value={subject.subjectId}>
                                        {subject.subjectName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handlePrint} disabled={!selectedSubjectId || loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        プレビューを作成
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
