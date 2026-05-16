'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Subject } from '@prisma/client';
import { useState } from 'react';

type FilterProps = {
    subjects: Subject[];
};

export function HistoryFilter({ subjects }: FilterProps) {
    const t = useTranslations('HistoryFilter');
    const router = useRouter();
    const searchParams = useSearchParams();

    const [subjectId, setSubjectId] = useState(searchParams.get('subjectId') || 'all');
    const [sort, setSort] = useState(searchParams.get('sort') || 'desc');
    const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
    const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

    const handleApply = () => {
        const params = new URLSearchParams();
        if (subjectId && subjectId !== 'all') params.set('subjectId', subjectId);
        if (sort) params.set('sort', sort);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);

        // Reset page on filter change
        params.set('page', '1');

        router.push(`?${params.toString()}`);
    };

    const handleReset = () => {
        setSubjectId('all');
        setSort('desc');
        setStartDate('');
        setEndDate('');
        router.push('?');
    };

    return (
        <div className="bg-card p-4 rounded-lg mb-6 space-y-4 md:space-y-0 md:flex md:items-end md:gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">{t('subject')}</label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder={t('allSubjects')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('allSubjects')}</SelectItem>
                        {subjects.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('sort')}</label>
                <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="desc">{t('newest')}</SelectItem>
                        <SelectItem value="asc">{t('oldest')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('startDate')}</label>
                <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-[150px]"
                />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('endDate')}</label>
                <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-[150px]"
                />
            </div>

            <div className="flex gap-2">
                <Button onClick={handleApply}>{t('search')}</Button>
                <Button variant="outline" onClick={handleReset}>{t('clear')}</Button>
            </div>
        </div>
    );
}
