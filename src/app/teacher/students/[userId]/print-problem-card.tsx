'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Subject {
    id: string;
    name: string;
}

interface PrintProblemCardProps {
    userId: string;
    subjects: Subject[];
}

export function PrintProblemCard({ userId, subjects }: PrintProblemCardProps) {
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handlePrint = () => {
        if (!selectedSubjectId) return;
        setLoading(true);
        router.push(`/teacher/students/${userId}/print?subjectId=${selectedSubjectId}`);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">問題印刷</CardTitle>
                <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                        <SelectTrigger>
                            <SelectValue placeholder="科目を選択" />
                        </SelectTrigger>
                        <SelectContent>
                            {subjects.map((subject) => (
                                <SelectItem key={subject.id} value={subject.id}>
                                    {subject.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        className="w-full"
                        disabled={!selectedSubjectId || loading}
                        onClick={handlePrint}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        プレビュー作成
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    選択した科目の弱点・復習問題を自動生成します
                </p>
            </CardContent>
        </Card>
    );
}
