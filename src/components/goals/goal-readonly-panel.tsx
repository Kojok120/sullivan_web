'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, CalendarRange, Target } from 'lucide-react';

import { getGoalDailyViewAction } from '@/app/actions/student-goals';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBrowserTimeZoneSafe, normalizeTimeZone, parseDateKeyAsUTC } from '@/lib/date-key';
import {
    formatGoalDateKeyLabel,
    formatGoalMonthLabel,
    getGoalRelativeDateLabel,
    resolveGoalTargetForDate,
} from '@/lib/student-goal-ui';
import { cn } from '@/lib/utils';
import type { DailyGoalEntry, GoalDailyViewPayload, StudentGoalView } from '@/lib/types/student-goal';

type GoalReadonlyPanelProps = {
    studentId: string;
    initialData: GoalDailyViewPayload;
    showTomorrow?: boolean;
    showTimeline?: boolean;
    className?: string;
};

function clampSelectedDateKey(selectedDateKey: string, data: GoalDailyViewPayload) {
    if (selectedDateKey < data.fromDateKey || selectedDateKey > data.toDateKey) {
        return data.todayKey;
    }

    return selectedDateKey;
}

function toGoalValueLabel(entry: DailyGoalEntry): string {
    if (entry.goalType === 'PROBLEM_COUNT') {
        const countLabel = entry.targetCount !== null ? `${entry.targetCount}問` : '未設定';
        return entry.targetText ? `${countLabel} / ${entry.targetText}` : countLabel;
    }

    const pieces: string[] = [];
    if (entry.targetText) pieces.push(entry.targetText);
    if (entry.targetCount !== null) pieces.push(String(entry.targetCount));
    return pieces.length > 0 ? pieces.join(' / ') : '未設定';
}

function getDaysDiff(baseDateKey: string, targetDateKey: string): number {
    const base = parseDateKeyAsUTC(baseDateKey).getTime();
    const target = parseDateKeyAsUTC(targetDateKey).getTime();
    return Math.floor((target - base) / (24 * 60 * 60 * 1000));
}

function GoalEntryItem({ entry }: { entry: DailyGoalEntry }) {
    return (
        <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{entry.subjectName || entry.goalName}</span>
                <Badge variant="outline" className="text-[11px]">
                    {entry.goalType === 'PROBLEM_COUNT' ? '問題数目標' : '任意目標'}
                </Badge>
                <span className="text-muted-foreground">{toGoalValueLabel(entry)}</span>
            </div>
        </div>
    );
}

function PriorityDayCard(props: {
    title: string;
    dateKey: string;
    icon: ReactNode;
    entries: DailyGoalEntry[];
    timeZone: string;
    emptyText: string;
    emphasis?: 'strong' | 'normal';
}) {
    return (
        <Card className={cn(props.emphasis === 'strong' && 'border-primary/30 bg-primary/[0.04]')}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <CardTitle className="text-base">{props.title}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{formatGoalDateKeyLabel(props.dateKey, props.timeZone)}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/80 p-2 text-muted-foreground">
                        {props.icon}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {props.entries.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{props.emptyText}</p>
                ) : (
                    <div className="space-y-2">
                        {props.entries.map((entry) => (
                            <GoalEntryItem key={`${entry.goalId}-${props.dateKey}`} entry={entry} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function GoalReadonlyPanel({
    studentId,
    initialData,
    showTomorrow = false,
    showTimeline = false,
    className,
}: GoalReadonlyPanelProps) {
    const [state, setState] = useState(() => ({
        data: initialData,
        initialDataSnapshot: initialData,
        selectedDateKey: initialData.todayKey,
    }));
    const [isPending, startTransition] = useTransition();
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const todayRowRef = useRef<HTMLButtonElement | null>(null);

    const resolvedState = state.initialDataSnapshot === initialData
        ? state
        : {
            data: initialData,
            initialDataSnapshot: initialData,
            selectedDateKey: clampSelectedDateKey(state.selectedDateKey, initialData),
        };
    const data = resolvedState.data;
    const selectedDateKey = resolvedState.selectedDateKey;

    useEffect(() => {
        const browserTimeZone = getBrowserTimeZoneSafe();
        if (normalizeTimeZone(browserTimeZone) === initialData.timeZone) {
            return;
        }

        let cancelled = false;

        startTransition(() => {
            void (async () => {
                const result = await getGoalDailyViewAction({
                    studentId,
                    timeZone: browserTimeZone,
                    fromDateKey: initialData.fromDateKey,
                    toDateKey: initialData.toDateKey,
                });

                if (!cancelled && result.success && result.data) {
                    setState((current) => {
                        const nextState = current.initialDataSnapshot === initialData
                            ? current
                            : {
                                data: initialData,
                                initialDataSnapshot: initialData,
                                selectedDateKey: clampSelectedDateKey(current.selectedDateKey, initialData),
                            };

                        return {
                            data: result.data,
                            initialDataSnapshot: initialData,
                            selectedDateKey: clampSelectedDateKey(nextState.selectedDateKey, result.data),
                        };
                    });
                }
            })();
        });

        return () => {
            cancelled = true;
        };
    }, [initialData, studentId, startTransition]);

    useEffect(() => {
        if (!showTimeline) return;
        if (!timelineRef.current || !todayRowRef.current) return;

        const container = timelineRef.current;
        const todayRow = todayRowRef.current;
        const nextTop = todayRow.offsetTop - container.clientHeight / 2 + todayRow.clientHeight / 2;

        container.scrollTo({
            top: Math.max(0, nextTop),
            behavior: 'smooth',
        });
    }, [data, showTimeline]);

    const effectiveSelectedDateKey = clampSelectedDateKey(selectedDateKey, data);

    const todayEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === data.todayKey)?.entries ?? [],
        [data]
    );

    const tomorrowEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === data.tomorrowKey)?.entries ?? [],
        [data]
    );

    const selectedEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === effectiveSelectedDateKey)?.entries ?? [],
        [data, effectiveSelectedDateKey]
    );

    const selectedTotals = useMemo(() => {
        let problemCount = 0;
        let customCount = 0;

        for (const entry of selectedEntries) {
            if (entry.goalType === 'PROBLEM_COUNT') {
                problemCount += entry.targetCount ?? 0;
            } else {
                customCount += 1;
            }
        }

        return {
            entryCount: selectedEntries.length,
            problemCount,
            customCount,
        };
    }, [selectedEntries]);

    const selectedRelativeLabel = getGoalRelativeDateLabel(effectiveSelectedDateKey, data.todayKey, data.tomorrowKey);

    return (
        <div className={cn('space-y-4', className)}>
            <div className={cn('grid gap-4', showTomorrow ? 'md:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-2')}>
                <PriorityDayCard
                    title="今日の目標"
                    dateKey={data.todayKey}
                    timeZone={data.timeZone}
                    entries={todayEntries}
                    emptyText="今日は設定された目標がありません"
                    icon={<Target className="h-4 w-4" />}
                    emphasis="strong"
                />

                {showTomorrow ? (
                    <PriorityDayCard
                        title="明日の目標"
                        dateKey={data.tomorrowKey}
                        timeZone={data.timeZone}
                        entries={tomorrowEntries}
                        emptyText="明日の目標は未設定です"
                        icon={<CalendarDays className="h-4 w-4" />}
                    />
                ) : null}

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <CardTitle className="text-base">期限付き目標一覧</CardTitle>
                                <p className="mt-1 text-xs text-muted-foreground">有効目標 {data.activeGoals.length}件</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-background/80 p-2 text-muted-foreground">
                                <CalendarRange className="h-4 w-4" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {data.activeGoals.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">有効な目標はありません</p>
                        ) : (
                            data.activeGoals.map((goal) => {
                                const remainingDays = getDaysDiff(data.todayKey, goal.dueDateKey);
                                const dueValue = resolveGoalTargetForDate(goal.milestones, goal.dueDateKey);
                                const valueLabel = goal.type === 'PROBLEM_COUNT'
                                    ? dueValue.targetCount !== null
                                        ? `${dueValue.targetCount}問`
                                        : '未設定'
                                    : dueValue.targetText || (dueValue.targetCount !== null ? String(dueValue.targetCount) : '未設定');

                                return (
                                    <div key={goal.id} className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm font-semibold">{goal.name}</div>
                                            <Badge variant="outline">{formatGoalDateKeyLabel(goal.dueDateKey, data.timeZone)}まで</Badge>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            {goal.subjectName ? <span>科目: {goal.subjectName}</span> : null}
                                            <span>期限値: {valueLabel}</span>
                                            <span>残り{Math.max(0, remainingDays)}日</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            </div>

            {showTimeline ? (
                <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">日付タイムライン</CardTitle>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        過去半年〜未来半年を日付で確認
                                    </p>
                                </div>
                                {isPending ? <span className="text-xs text-muted-foreground">同期中...</span> : null}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div ref={timelineRef} className="max-h-[560px] overflow-y-auto rounded-lg border border-border/70">
                                {data.rows.map((row, index) => {
                                    const prevMonth = data.rows[index - 1]?.dateKey.slice(0, 7);
                                    const monthChanged = prevMonth !== row.dateKey.slice(0, 7);
                                    const isToday = row.dateKey === data.todayKey;
                                    const isSelected = row.dateKey === effectiveSelectedDateKey;
                                    const relativeLabel = getGoalRelativeDateLabel(row.dateKey, data.todayKey, data.tomorrowKey);

                                    return (
                                        <div key={row.dateKey}>
                                            {monthChanged ? (
                                                <div className="sticky top-0 z-10 border-y bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                                                    {formatGoalMonthLabel(row.dateKey, data.timeZone)}
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                ref={isToday ? todayRowRef : null}
                                                onClick={() => {
                                                    setState((current) => {
                                                        const nextState = current.initialDataSnapshot === initialData
                                                            ? current
                                                            : {
                                                                data: initialData,
                                                                initialDataSnapshot: initialData,
                                                                selectedDateKey: clampSelectedDateKey(current.selectedDateKey, initialData),
                                                            };

                                                        return {
                                                            ...nextState,
                                                            selectedDateKey: row.dateKey,
                                                        };
                                                    });
                                                }}
                                                className={cn(
                                                    'w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                                                    isSelected && 'bg-primary/[0.08] ring-1 ring-primary/30',
                                                    isToday && !isSelected && 'bg-accent/45'
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium">{formatGoalDateKeyLabel(row.dateKey, data.timeZone)}</p>
                                                    <div className="flex items-center gap-1">
                                                        {relativeLabel ? (
                                                            <Badge variant="secondary" className="text-[10px]">{relativeLabel}</Badge>
                                                        ) : null}
                                                        <Badge variant="outline" className="text-[10px]">{row.entries.length}件</Badge>
                                                    </div>
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">{formatGoalDateKeyLabel(effectiveSelectedDateKey, data.timeZone)} の目標</CardTitle>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {selectedRelativeLabel ? `${selectedRelativeLabel}の表示` : '選択した日付の表示'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline">合計 {selectedTotals.entryCount}件</Badge>
                                    <Badge variant="outline">問題数 {selectedTotals.problemCount}問</Badge>
                                    <Badge variant="outline">任意目標 {selectedTotals.customCount}件</Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {selectedEntries.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
                                    この日は目標が設定されていません
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {selectedEntries.map((entry) => (
                                        <div key={`${effectiveSelectedDateKey}-${entry.goalId}`} className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold">{entry.subjectName || entry.goalName}</span>
                                                    <Badge variant="outline" className="text-[11px]">
                                                        {entry.goalType === 'PROBLEM_COUNT' ? '問題数目標' : '任意目標'}
                                                    </Badge>
                                                </div>
                                                <Badge variant="secondary" className="text-[11px]">
                                                    {formatGoalDateKeyLabel(entry.dueDateKey, data.timeZone)}まで
                                                </Badge>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{toGoalValueLabel(entry)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
