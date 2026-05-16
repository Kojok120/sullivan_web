'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { appendCacheBust } from '@/components/print/cache-bust';
import { getPreferredPrintView } from '@/lib/print-view';
import { useTranslations } from 'next-intl';

interface Subject {
    id: string;
    name: string;
}

interface PrintProblemCardProps {
    userId: string;
    subjects: Subject[];
}

export function PrintProblemCard({ userId, subjects }: PrintProblemCardProps) {
    const t = useTranslations('TeacherPrintProblemCard');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [selectedCoreProblemId, setSelectedCoreProblemId] = useState<string>('');
    const [sets, setSets] = useState<number>(1);
    const [coreProblems, setCoreProblems] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingCoreProblems, setFetchingCoreProblems] = useState(false);
    const router = useRouter();

    // Fetch CoreProblems when subject changes
    useEffect(() => {
        if (!selectedSubjectId) {
            setCoreProblems([]);
            setSelectedCoreProblemId('');
            setSets(1);
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
        const pageQuery = new URLSearchParams({
            subjectId: selectedSubjectId,
            sets: String(sets),
            view: getPreferredPrintView(),
        });
        if (selectedCoreProblemId && selectedCoreProblemId !== 'all') {
            pageQuery.set('coreProblemId', selectedCoreProblemId);
        }
        const pageUrl = appendCacheBust(`/teacher/students/${userId}/print?${pageQuery.toString()}`);
        const opened = window.open(pageUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
            router.push(pageUrl);
        }
        setLoading(false);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('title')}</CardTitle>
                <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('subjectLabel')}</label>
                        <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('subjectPlaceholder')} />
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
                        <label className="text-xs font-medium text-muted-foreground">{t('coreProblemLabel')}</label>
                        <Select
                            value={selectedCoreProblemId}
                            onValueChange={setSelectedCoreProblemId}
                            disabled={!selectedSubjectId || fetchingCoreProblems}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={fetchingCoreProblems ? t('coreProblemLoading') : t('coreProblemPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('coreProblemAll')}</SelectItem>
                                {coreProblems.map((cp) => (
                                    <SelectItem key={cp.id} value={cp.id}>
                                        {cp.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('setsLabel')}</label>
                        <Select
                            value={sets.toString()}
                            onValueChange={(val) => setSets(parseInt(val))}
                            disabled={!selectedSubjectId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t('setsPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <SelectItem key={num} value={num.toString()}>
                                        {t('setOption', { sets: num, problems: num * 10 })}
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
                        {t('createPreview')}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    {t('description')}
                </p>
            </CardContent>
        </Card>
    );
}
