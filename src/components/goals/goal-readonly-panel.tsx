'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getGoalDailyViewAction } from '@/app/actions/student-goals';
import { getBrowserTimeZoneSafe, normalizeTimeZone } from '@/lib/date-key';
import type { DailyGoalEntry, GoalDailyViewPayload } from '@/lib/types/student-goal';

type GoalReadonlyPanelProps = {
    studentId: string;
    initialData: GoalDailyViewPayload;
    showTomorrow?: boolean;
    showTimeline?: boolean;
    className?: string;
};

function formatDateKeyLabel(dateKey: string, timeZone: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: normalizeTimeZone(timeZone),
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
}

function GoalEntryText({ entry }: { entry: DailyGoalEntry }) {
    if (entry.goalType === 'PROBLEM_COUNT') {
        const countLabel = entry.targetCount !== null ? `${entry.targetCount}問` : '未設定';
        return (
            <div className="text-sm">
                <span className="font-medium">{entry.subjectName || entry.goalName}</span>
                <span className="ml-2 text-muted-foreground">{countLabel}</span>
                {entry.targetText ? <span className="ml-2 text-muted-foreground">{entry.targetText}</span> : null}
            </div>
        );
    }

    return (
        <div className="text-sm">
            <span className="font-medium">{entry.goalName}</span>
            {entry.targetText ? <span className="ml-2 text-muted-foreground">{entry.targetText}</span> : null}
            {entry.targetCount !== null ? <span className="ml-2 text-muted-foreground">{entry.targetCount}</span> : null}
        </div>
    );
}

function DayGoalList({ title, entries }: { title: string; entries: DailyGoalEntry[] }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">目標はありません</p>
                ) : (
                    entries.map((entry) => (
                        <GoalEntryText key={`${entry.goalId}-${entry.dueDateKey}`} entry={entry} />
                    ))
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
    const [data, setData] = useState<GoalDailyViewPayload>(initialData);
    const [isPending, startTransition] = useTransition();
    const todayRowRef = useRef<HTMLDivElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const browserTimeZone = getBrowserTimeZoneSafe();

        startTransition(() => {
            void (async () => {
                const result = await getGoalDailyViewAction({
                    studentId,
                    timeZone: browserTimeZone,
                });
                if (result.success && result.data) {
                    setData(result.data);
                }
            })();
        });
    }, [studentId]);

    useEffect(() => {
        if (!showTimeline) return;
        if (!timelineRef.current || !todayRowRef.current) return;

        const container = timelineRef.current;
        const row = todayRowRef.current;

        const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, [data, showTimeline]);

    const todayEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === data.todayKey)?.entries ?? [],
        [data]
    );
    const tomorrowEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === data.tomorrowKey)?.entries ?? [],
        [data]
    );

    return (
        <div className={className}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <DayGoalList title="今日の目標" entries={todayEntries} />
                {showTomorrow ? <DayGoalList title="明日の目標" entries={tomorrowEntries} /> : null}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">〇〇日までの目標</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {data.activeGoals.length === 0 ? (
                            <p className="text-sm text-muted-foreground">有効な目標はありません</p>
                        ) : (
                            data.activeGoals.map((goal) => (
                                <div key={goal.id} className="rounded-md border p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">{goal.name}</div>
                                        <Badge variant="outline">{formatDateKeyLabel(goal.dueDateKey, data.timeZone)}まで</Badge>
                                    </div>
                                    {goal.subjectName ? (
                                        <p className="text-xs text-muted-foreground">科目: {goal.subjectName}</p>
                                    ) : null}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {showTimeline ? (
                <Card className="mt-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">日付別目標（過去半年〜未来半年）</CardTitle>
                        {isPending ? <p className="text-xs text-muted-foreground">読み込み中...</p> : null}
                    </CardHeader>
                    <CardContent>
                        <div ref={timelineRef} className="max-h-[520px] overflow-y-auto rounded-md border">
                            {data.rows.map((row) => {
                                const isToday = row.dateKey === data.todayKey;
                                return (
                                    <div
                                        key={row.dateKey}
                                        ref={isToday ? todayRowRef : null}
                                        className={`border-b p-3 last:border-0 ${isToday ? 'bg-accent/40' : ''}`}
                                    >
                                        <div className="mb-2 text-sm font-medium">
                                            {formatDateKeyLabel(row.dateKey, data.timeZone)}
                                            {isToday ? <span className="ml-2 text-xs text-primary">今日</span> : null}
                                        </div>
                                        {row.entries.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">未設定</div>
                                        ) : (
                                            <div className="space-y-1">
                                                {row.entries.map((entry) => (
                                                    <GoalEntryText key={`${row.dateKey}-${entry.goalId}`} entry={entry} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
