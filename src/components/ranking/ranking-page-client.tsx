'use client';

import { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ClassroomOption } from '@/lib/types/classroom';
import {
    RANKING_CATEGORY_KEYS,
    RANKING_PERIOD_KEYS,
    rankingResponseSchema,
    type RankingCategoryKey,
    type RankingEntry,
    type RankingPeriodKey,
    type RankingResponse,
} from '@/lib/types/ranking';

type RankingPageClientProps = {
    apiPath: string;
    heading: string;
    description: string;
    showClassroomSelector?: boolean;
    classrooms?: Pick<ClassroomOption, 'id' | 'name'>[];
};

const DEFAULT_TIME_ZONE = 'Asia/Tokyo';
const RANKING_CATEGORY_KEY_SET = new Set<string>(RANKING_CATEGORY_KEYS);
const RANKING_PERIOD_KEY_SET = new Set<string>(RANKING_PERIOD_KEYS);

function getValueLabel(category: RankingCategoryKey): string {
    return category === 'problemCount' ? '問題数' : 'スコア';
}

function isRankingCategoryKey(value: string): value is RankingCategoryKey {
    return RANKING_CATEGORY_KEY_SET.has(value);
}

function isRankingPeriodKey(value: string): value is RankingPeriodKey {
    return RANKING_PERIOD_KEY_SET.has(value);
}

function getApiErrorMessage(payload: unknown): string | null {
    if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof (payload as { error?: unknown }).error === 'string'
    ) {
        return (payload as { error: string }).error;
    }

    return null;
}

export function RankingPageClient({
    apiPath,
    heading,
    description,
    showClassroomSelector = false,
    classrooms = [],
}: RankingPageClientProps) {
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [category, setCategory] = useState<RankingCategoryKey>('problemCount');
    const [period, setPeriod] = useState<RankingPeriodKey>('week');
    const [selectedClassroomId, setSelectedClassroomId] = useState('');
    const [data, setData] = useState<RankingResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (resolved && resolved.length > 0) {
            setTimeZone(resolved);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchRanking = async () => {
            if (showClassroomSelector && !selectedClassroomId) {
                setData(null);
                setIsLoading(false);
                setErrorMessage(null);
                return;
            }

            setIsLoading(true);
            setErrorMessage(null);

            try {
                const params = new URLSearchParams({
                    timeZone,
                });

                if (showClassroomSelector && selectedClassroomId) {
                    params.set('classroomId', selectedClassroomId);
                }

                const response = await fetch(`${apiPath}?${params.toString()}`, {
                    method: 'GET',
                    cache: 'no-store',
                });

                const payload: unknown = await response.json();
                if (!response.ok) {
                    throw new Error(getApiErrorMessage(payload) ?? 'ランキングの取得に失敗しました');
                }

                const parsedPayload = rankingResponseSchema.safeParse(payload);
                if (!parsedPayload.success) {
                    throw new Error('ランキングデータの形式が不正です');
                }

                if (!cancelled) {
                    setData(parsedPayload.data);
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : 'ランキングの取得に失敗しました';
                    setErrorMessage(message);
                    setData(null);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void fetchRanking();

        return () => {
            cancelled = true;
        };
    }, [apiPath, selectedClassroomId, showClassroomSelector, timeZone]);

    const entries: RankingEntry[] = useMemo(() => {
        if (!data) return [];
        return data[category][period];
    }, [category, data, period]);

    const periodLabel = data?.periods[period].label;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-3">
                    <CardTitle className="text-2xl sm:text-3xl">{heading}</CardTitle>
                    <p className="text-sm text-muted-foreground">{description}</p>

                    {showClassroomSelector && (
                        <div className="w-full max-w-sm">
                            <Select value={selectedClassroomId} onValueChange={setSelectedClassroomId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="教室を選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    {classrooms.map((classroom) => (
                                        <SelectItem key={classroom.id} value={classroom.id}>
                                            {classroom.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardHeader>
            </Card>

            <Card>
                <CardContent className="space-y-6 pt-6">
                    <div className="space-y-4">
                        <Tabs
                            value={category}
                            onValueChange={(value) => {
                                if (isRankingCategoryKey(value)) {
                                    setCategory(value);
                                }
                            }}
                            className="space-y-0"
                        >
                            <TabsList className="grid w-full max-w-md grid-cols-2">
                                <TabsTrigger value="problemCount">問題数</TabsTrigger>
                                <TabsTrigger value="vocabularyScore">英単語スコア</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <Tabs
                            value={period}
                            onValueChange={(value) => {
                                if (isRankingPeriodKey(value)) {
                                    setPeriod(value);
                                }
                            }}
                            className="space-y-0"
                        >
                            <TabsList className="grid w-full max-w-xs grid-cols-2">
                                <TabsTrigger value="week">週</TabsTrigger>
                                <TabsTrigger value="month">月</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {periodLabel ? (
                        <p className="text-sm text-muted-foreground">対象期間: {periodLabel}（{data?.timeZone}）</p>
                    ) : null}

                    {showClassroomSelector && !selectedClassroomId ? (
                        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                            教室を選択するとランキングを表示します。
                        </div>
                    ) : isLoading ? (
                        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">読み込み中...</div>
                    ) : errorMessage ? (
                        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-6 text-center text-sm text-destructive">
                            {errorMessage}
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">ランキングデータがありません。</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">順位</TableHead>
                                        <TableHead>名前</TableHead>
                                        <TableHead>ログインID</TableHead>
                                        <TableHead>グループ</TableHead>
                                        <TableHead className="text-right">{getValueLabel(category)}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.map((entry) => (
                                        <TableRow key={`${entry.userId}-${entry.rank}`}>
                                            <TableCell className="font-semibold">{entry.rank}</TableCell>
                                            <TableCell>{entry.name}</TableCell>
                                            <TableCell>{entry.loginId}</TableCell>
                                            <TableCell>{entry.group ?? '-'}</TableCell>
                                            <TableCell className="text-right font-semibold">{entry.value}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
