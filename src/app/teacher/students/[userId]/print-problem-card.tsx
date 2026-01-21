'use client';

import { useState, useEffect } from 'react';
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
    const [selectedCoreProblemId, setSelectedCoreProblemId] = useState<string>('');
    const [coreProblems, setCoreProblems] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingCoreProblems, setFetchingCoreProblems] = useState(false);
    const router = useRouter();

    // Fetch CoreProblems when subject changes
    useEffect(() => {
        if (!selectedSubjectId) {
            setCoreProblems([]);
            setSelectedCoreProblemId('');
            return;
        }

        const fetchCoreProblems = async () => {
            setFetchingCoreProblems(true);
            // Dynamic import to avoid server action issues if any, or just call it directly if it's a server action
            const { getCoreProblemsForSubject } = await import('@/app/admin/curriculum/actions');
            const result = await getCoreProblemsForSubject(selectedSubjectId);
            if (result.success && result.coreProblems) {
                setCoreProblems(result.coreProblems);
            } else {
                setCoreProblems([]);
            }
            setFetchingCoreProblems(false);
        };

        fetchCoreProblems();
        setSelectedCoreProblemId(''); // Reset selection on subject change
    }, [selectedSubjectId]);


    const handlePrint = () => {
        if (!selectedSubjectId) return;
        setLoading(true);
        let url = `/teacher/students/${userId}/print?subjectId=${selectedSubjectId}`;
        if (selectedCoreProblemId && selectedCoreProblemId !== 'all') {
            url += `&coreProblemId=${selectedCoreProblemId}`;
        }
        router.push(url);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">問題印刷</CardTitle>
                <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">科目</label>
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
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">単元 (任意)</label>
                        <Select
                            value={selectedCoreProblemId}
                            onValueChange={setSelectedCoreProblemId}
                            disabled={!selectedSubjectId || fetchingCoreProblems}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={fetchingCoreProblems ? "読み込み中..." : "単元を選択 (指定なし)"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">指定なし (全範囲)</SelectItem>
                                {coreProblems.map((cp) => (
                                    <SelectItem key={cp.id} value={cp.id}>
                                        {cp.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        className="w-full mt-2"
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
