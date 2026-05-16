'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClassroomOption } from '@/lib/types/classroom';
import {
    RANKING_CUSTOM_RANGE_MAX_MONTHS,
    rankingResponseSchema,
    type RankingCategoryKey,
    type RankingEntry,
    type RankingPeriodKey,
    type RankingResponse,
} from '@/lib/types/ranking';
import { cn } from '@/lib/utils';

type RankingPageClientProps = {
    apiPath: string;
    heading: string;
    description: string;
    showClassroomSelector?: boolean;
    classrooms?: Pick<ClassroomOption, 'id' | 'name'>[];
};

const DEFAULT_TIME_ZONE = 'Asia/Tokyo';
const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const CATEGORY_OPTIONS: Array<{ key: RankingCategoryKey; labelKey: 'categoryProblemCount' | 'categoryVocabularyScore' | 'categoryAccuracy' }> = [
    { key: 'problemCount', labelKey: 'categoryProblemCount' },
    { key: 'vocabularyScore', labelKey: 'categoryVocabularyScore' },
    { key: 'accuracy', labelKey: 'categoryAccuracy' },
];
const PERIOD_OPTIONS: Array<{ key: RankingPeriodKey; labelKey: 'periodThisMonth' | 'periodThreeMonths' | 'periodOneYear' | 'periodCustom' }> = [
    { key: '1m', labelKey: 'periodThisMonth' },
    { key: '3m', labelKey: 'periodThreeMonths' },
    { key: '12m', labelKey: 'periodOneYear' },
    { key: 'custom', labelKey: 'periodCustom' },
];

const MEDAL_STYLES: Record<number, { bg: string; border: string; text: string; badge: string }> = {
    1: {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-300 dark:border-amber-700',
        text: 'text-amber-700 dark:text-amber-400',
        badge: 'bg-amber-500 text-white',
    },
    2: {
        bg: 'bg-slate-50 dark:bg-slate-900/30',
        border: 'border-slate-300 dark:border-slate-600',
        text: 'text-slate-600 dark:text-slate-300',
        badge: 'bg-slate-400 text-white',
    },
    3: {
        bg: 'bg-orange-50 dark:bg-orange-950/30',
        border: 'border-orange-300 dark:border-orange-700',
        text: 'text-orange-700 dark:text-orange-400',
        badge: 'bg-orange-500 text-white',
    },
};

function formatRankingValue(category: RankingCategoryKey, value: number): string {
    return category === 'accuracy' ? `${value}%` : String(value);
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

function countInclusiveMonths(startMonth: string, endMonth: string): number {
    const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
    const [endYear, endMonthNumber] = endMonth.split('-').map(Number);

    return (endYear - startYear) * 12 + (endMonthNumber - startMonthNumber) + 1;
}

function getCustomRangeValidationMessage(
    startMonth: string,
    endMonth: string,
    messages: {
        monthRequired: string;
        monthFormat: string;
        monthOrder: string;
        maxMonths: string;
    }
): string | null {
    if (!startMonth || !endMonth) {
        return messages.monthRequired;
    }

    if (!MONTH_KEY_REGEX.test(startMonth) || !MONTH_KEY_REGEX.test(endMonth)) {
        return messages.monthFormat;
    }

    if (startMonth > endMonth) {
        return messages.monthOrder;
    }

    if (countInclusiveMonths(startMonth, endMonth) > RANKING_CUSTOM_RANGE_MAX_MONTHS) {
        return messages.maxMonths;
    }

    return null;
}

/** デスクトップでのポディアム配置用 CSS order: 2位(左), 1位(中央), 3位(右) */
const PODIUM_ORDER: Record<number, string> = {
    1: 'sm:order-2',
    2: 'sm:order-1',
    3: 'sm:order-3',
};

/** 上位3名のポディアムカード */
function PodiumCard({
    entry,
    maxValue,
    valueUnit,
}: {
    entry: RankingEntry;
    maxValue: number;
    valueUnit: string;
}) {
    const style = MEDAL_STYLES[entry.rank];
    if (!style) return null;

    const percentage = maxValue > 0 ? Math.round((entry.value / maxValue) * 100) : 0;

    return (
        <div
            className={cn(
                'relative flex flex-col items-center rounded-xl border-2 p-4 transition-all sm:p-5',
                style.bg,
                style.border,
                entry.rank === 1 && 'sm:-mt-3 sm:scale-105',
                PODIUM_ORDER[entry.rank],
            )}
        >
            {/* 順位バッジ */}
            <div
                className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-base font-bold shadow-sm',
                    style.badge,
                )}
            >
                {entry.rank}
            </div>

            {/* 名前 */}
            <p className="mt-3 text-center text-sm font-semibold leading-tight">{entry.name}</p>

            {/* グループ */}
            {entry.group ? (
                <p className="mt-1 text-center text-xs text-muted-foreground">{entry.group}</p>
            ) : null}

            {/* 値 */}
            <p className={cn('mt-3 text-2xl font-bold tabular-nums', style.text)}>
                {entry.value}
                <span className="text-sm font-medium">{valueUnit}</span>
            </p>

            {/* プログレスバー */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                    className={cn('h-full rounded-full transition-all duration-500', style.badge)}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

/** 4位以下のリスト行 */
function RankingListItem({
    entry,
    category,
    maxValue,
}: {
    entry: RankingEntry;
    category: RankingCategoryKey;
    maxValue: number;
}) {
    const percentage = maxValue > 0 ? Math.round((entry.value / maxValue) * 100) : 0;

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50">
            {/* 順位 */}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums text-muted-foreground">
                {entry.rank}
            </span>

            {/* 名前・グループ */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {entry.group ?? entry.loginId}
                </p>
            </div>

            {/* プログレスバー（デスクトップのみ） */}
            <div className="hidden w-24 sm:block">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full rounded-full bg-primary/60 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* 値 */}
            <span className="shrink-0 text-right text-sm font-bold tabular-nums">
                {formatRankingValue(category, entry.value)}
            </span>
        </div>
    );
}

/** ローディングスケルトン */
function RankingSkeleton() {
    return (
        <div className="space-y-6">
            {/* ポディアムスケルトン */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                {[2, 1, 3].map((rank) => (
                    <div
                        key={rank}
                        className={cn(
                            'flex animate-pulse flex-col items-center rounded-xl border-2 border-muted p-5',
                            rank === 1 && 'sm:-mt-3',
                        )}
                    >
                        <div className="h-9 w-9 rounded-full bg-muted" />
                        <div className="mt-3 h-4 w-20 rounded bg-muted" />
                        <div className="mt-3 h-7 w-16 rounded bg-muted" />
                        <div className="mt-2 h-1.5 w-full rounded-full bg-muted" />
                    </div>
                ))}
            </div>

            {/* リストスケルトン */}
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg border px-4 py-3">
                        <div className="h-8 w-8 rounded-full bg-muted" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-24 rounded bg-muted" />
                            <div className="h-3 w-16 rounded bg-muted" />
                        </div>
                        <div className="h-4 w-12 rounded bg-muted" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RankingPageClient({
    apiPath,
    heading,
    description,
    showClassroomSelector = false,
    classrooms = [],
}: RankingPageClientProps) {
    const t = useTranslations('Ranking');
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [category, setCategory] = useState<RankingCategoryKey>('problemCount');
    const [periodKey, setPeriodKey] = useState<RankingPeriodKey>('1m');
    const [customStartMonth, setCustomStartMonth] = useState('');
    const [customEndMonth, setCustomEndMonth] = useState('');
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

    const customRangeMessage = useMemo(() => {
        if (periodKey !== 'custom') {
            return null;
        }

        return getCustomRangeValidationMessage(customStartMonth, customEndMonth, {
            monthRequired: t('validationMonthRequired'),
            monthFormat: t('validationMonthFormat'),
            monthOrder: t('validationMonthOrder'),
            maxMonths: t('validationMaxMonths', { months: RANKING_CUSTOM_RANGE_MAX_MONTHS }),
        });
    }, [customEndMonth, customStartMonth, periodKey, t]);

    useEffect(() => {
        let cancelled = false;

        const fetchRanking = async () => {
            if (showClassroomSelector && !selectedClassroomId) {
                setData(null);
                setIsLoading(false);
                setErrorMessage(null);
                return;
            }

            if (periodKey === 'custom' && customRangeMessage) {
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
                    range: periodKey,
                });

                if (showClassroomSelector && selectedClassroomId) {
                    params.set('classroomId', selectedClassroomId);
                }

                if (periodKey === 'custom') {
                    params.set('startMonth', customStartMonth);
                    params.set('endMonth', customEndMonth);
                }

                const response = await fetch(`${apiPath}?${params.toString()}`, {
                    method: 'GET',
                    cache: 'no-store',
                });

                const payload: unknown = await response.json();
                if (!response.ok) {
                    throw new Error(getApiErrorMessage(payload) ?? t('fetchFailed'));
                }

                const parsedPayload = rankingResponseSchema.safeParse(payload);
                if (!parsedPayload.success) {
                    throw new Error(t('invalidData'));
                }

                if (!cancelled) {
                    setData(parsedPayload.data);
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : t('fetchFailed');
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
    }, [
        apiPath,
        customEndMonth,
        customRangeMessage,
        customStartMonth,
        periodKey,
        selectedClassroomId,
        showClassroomSelector,
        t,
        timeZone,
    ]);

    const entries: RankingEntry[] = useMemo(() => {
        if (!data) return [];
        return data[category];
    }, [category, data]);

    const topThree = entries.filter((e) => e.rank <= 3);
    const rest = entries.filter((e) => e.rank > 3);
    const maxValue = entries.length > 0 ? entries[0].value : 0;

    const periodLabel = data?.period.label;
    const valueUnit = category === 'problemCount'
        ? t('unitProblemCount')
        : category === 'vocabularyScore'
        ? t('unitVocabularyScore')
        : t('unitAccuracy');

    return (
        <div className="space-y-6">
            {/* ヘッダー */}
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {/* コントロール */}
            <Card>
                <CardContent className="space-y-4 pt-6">
                    {showClassroomSelector && (
                        <div className="w-full max-w-sm">
                            <Select value={selectedClassroomId} onValueChange={setSelectedClassroomId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder={t('classroomPlaceholder')} />
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

                    {/* カテゴリ切り替え */}
                    <div className="inline-flex h-10 w-full max-w-md items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                        {CATEGORY_OPTIONS.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                className={cn(
                                    'inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
                                    category === option.key
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'hover:text-foreground/80',
                                )}
                                onClick={() => setCategory(option.key)}
                            >
                                {t(option.labelKey)}
                            </button>
                        ))}
                    </div>

                    {/* 期間切り替え */}
                    <div className="flex flex-wrap items-center gap-2">
                        {PERIOD_OPTIONS.map((option) => (
                            <Button
                                key={option.key}
                                type="button"
                                variant={periodKey === option.key ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPeriodKey(option.key)}
                            >
                                {t(option.labelKey)}
                            </Button>
                        ))}
                    </div>

                    {/* カスタム期間 */}
                    {periodKey === 'custom' ? (
                        <div className="grid max-w-md gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm">
                                <span className="font-medium">{t('startMonth')}</span>
                                <Input
                                    type="month"
                                    value={customStartMonth}
                                    onChange={(event) => setCustomStartMonth(event.target.value)}
                                />
                            </label>
                            <label className="space-y-1.5 text-sm">
                                <span className="font-medium">{t('endMonth')}</span>
                                <Input
                                    type="month"
                                    value={customEndMonth}
                                    onChange={(event) => setCustomEndMonth(event.target.value)}
                                />
                            </label>
                        </div>
                    ) : null}

                    {/* 期間ラベル・注釈 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {periodLabel ? (
                            <Badge variant="secondary" className="font-normal">
                                {periodLabel}
                            </Badge>
                        ) : null}
                        {data?.classroom.name ? (
                            <Badge variant="outline" className="font-normal">
                                {data.classroom.name}
                            </Badge>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            {/* ランキング本体 */}
            {showClassroomSelector && !selectedClassroomId ? (
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        {t('selectClassroomPrompt')}
                    </CardContent>
                </Card>
            ) : periodKey === 'custom' && customRangeMessage ? (
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        {customRangeMessage}
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <RankingSkeleton />
            ) : errorMessage ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-sm text-destructive">{errorMessage}</p>
                    </CardContent>
                </Card>
            ) : entries.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        {t('emptyData')}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {/* 上位3名ポディアム: モバイルは1,2,3順、デスクトップは2,1,3のポディアム配置 */}
                    {topThree.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                            {topThree.map((entry) => (
                                <PodiumCard
                                    key={entry.userId}
                                    entry={entry}
                                    maxValue={maxValue}
                                    valueUnit={valueUnit}
                                />
                            ))}
                        </div>
                    )}

                    {/* 4位以下リスト */}
                    {rest.length > 0 && (
                        <div className="space-y-2">
                            {rest.map((entry) => (
                                <RankingListItem
                                    key={entry.userId}
                                    entry={entry}
                                    category={category}
                                    maxValue={maxValue}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
