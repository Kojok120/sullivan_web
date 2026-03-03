'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Clock3, RefreshCcw, Save, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import {
    formatDateKeyLabel,
    formatMonthLabel,
    getGoalTypeLabel,
    getRelativeDateLabel,
    type DayDraftMap,
    type EditableGoal,
} from './goal-view-utils';

type GoalDailyTabProps = {
    timeZone: string;
    todayKey: string;
    tomorrowKey: string;
    rows: Array<{ dateKey: string; entries: Array<{ goalId: string; goalName: string; subjectName: string | null; targetCount: number | null; targetText: string | null }> }>;
    selectedDateKey: string;
    selectedRelativeLabel: string | null;
    selectedDateEntries: Array<{ goalId: string; goalName: string; subjectName: string | null; targetCount: number | null; targetText: string | null }>;
    selectedDateStats: { allCount: number; problemTotal: number; customCount: number };
    persistedGoals: EditableGoal[];
    dayDraft: DayDraftMap;
    savingDay: boolean;
    timelineRef: RefObject<HTMLDivElement | null>;
    todayRef: RefObject<HTMLButtonElement | null>;
    onSelectDate: (dateKey: string) => void;
    onSaveDay: () => void;
    onSetDayDraft: Dispatch<SetStateAction<DayDraftMap>>;
    onScrollToToday: () => void;
};

export function GoalDailyTab(props: GoalDailyTabProps) {
    const {
        timeZone,
        todayKey,
        tomorrowKey,
        rows,
        selectedDateKey,
        selectedRelativeLabel,
        selectedDateEntries,
        selectedDateStats,
        persistedGoals,
        dayDraft,
        savingDay,
        timelineRef,
        todayRef,
        onSelectDate,
        onSaveDay,
        onSetDayDraft,
        onScrollToToday,
    } = props;

    return (
        <TabsContent value="daily" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">日付タイムライン</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={onScrollToToday}>
                                <RefreshCcw className="mr-1 h-4 w-4" />
                                今日へ戻る
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">過去半年〜未来半年を全日表示</p>
                    </CardHeader>
                    <CardContent>
                        <div ref={timelineRef} className="max-h-[600px] overflow-y-auto rounded-lg border border-border/70">
                            {rows.map((row, index) => {
                                const prevMonth = rows[index - 1]?.dateKey.slice(0, 7);
                                const monthChanged = prevMonth !== row.dateKey.slice(0, 7);
                                const isToday = row.dateKey === todayKey;
                                const isSelected = row.dateKey === selectedDateKey;
                                const relativeLabel = getRelativeDateLabel(row.dateKey, todayKey, tomorrowKey);

                                return (
                                    <div key={row.dateKey}>
                                        {monthChanged ? (
                                            <div className="sticky top-0 z-10 border-y bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                                                {formatMonthLabel(row.dateKey, timeZone)}
                                            </div>
                                        ) : null}

                                        <button
                                            type="button"
                                            ref={isToday ? todayRef : null}
                                            onClick={() => onSelectDate(row.dateKey)}
                                            className={cn(
                                                'w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                                                isSelected && 'bg-primary/[0.08] ring-1 ring-primary/30',
                                                isToday && !isSelected && 'bg-accent/45',
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium">{formatDateKeyLabel(row.dateKey, timeZone)}</p>
                                                <div className="flex items-center gap-1">
                                                    {relativeLabel ? <Badge variant="secondary" className="text-[10px]">{relativeLabel}</Badge> : null}
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
                                <CardTitle className="text-base">{formatDateKeyLabel(selectedDateKey, timeZone)} の目標編集</CardTitle>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {selectedRelativeLabel ? `${selectedRelativeLabel}の編集` : '選択日の編集'}
                                </p>
                            </div>
                            <Button type="button" size="sm" onClick={onSaveDay} disabled={savingDay || persistedGoals.length === 0}>
                                <Save className="mr-1 h-4 w-4" />
                                {savingDay ? '保存中...' : 'この日を保存'}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">目標数 {selectedDateStats.allCount}件</Badge>
                            <Badge variant="outline">問題数 {selectedDateStats.problemTotal}問</Badge>
                            <Badge variant="outline">任意目標 {selectedDateStats.customCount}件</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {persistedGoals.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
                                先に「目標設計」タブで目標を保存すると、日次編集が可能になります。
                            </p>
                        ) : (
                            persistedGoals.map((goal) => {
                                const draft = dayDraft[goal.id] ?? { targetCount: '', targetText: '' };

                                return (
                                    <div key={goal.id} className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">{goal.name}</span>
                                                <Badge variant="outline" className="text-[11px]">{getGoalTypeLabel(goal.type)}</Badge>
                                            </div>
                                            <Badge variant="secondary" className="text-[11px]">
                                                {formatDateKeyLabel(goal.dueDateKey, timeZone)}まで
                                            </Badge>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Target className="h-3.5 w-3.5" />
                                                    問題数
                                                </label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={draft.targetCount}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        onSetDayDraft((prev) => {
                                                            const current = prev[goal.id] ?? { targetCount: '', targetText: '' };
                                                            return {
                                                                ...prev,
                                                                [goal.id]: {
                                                                    ...current,
                                                                    targetCount: value,
                                                                },
                                                            };
                                                        });
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock3 className="h-3.5 w-3.5" />
                                                    内容
                                                </label>
                                                <Input
                                                    value={draft.targetText}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        onSetDayDraft((prev) => {
                                                            const current = prev[goal.id] ?? { targetCount: '', targetText: '' };
                                                            return {
                                                                ...prev,
                                                                [goal.id]: {
                                                                    ...current,
                                                                    targetText: value,
                                                                },
                                                            };
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-sm">
                            <div className="mb-2 font-medium">現在DBに反映済みの値（表示専用）</div>
                            {selectedDateEntries.length === 0 ? (
                                <div className="text-muted-foreground">未設定</div>
                            ) : (
                                <div className="space-y-1">
                                    {selectedDateEntries.map((entry) => (
                                        <div key={`${entry.goalId}-${selectedDateKey}`}>
                                            <span className="font-medium">{entry.subjectName || entry.goalName}</span>
                                            {entry.targetCount !== null ? <span className="ml-2 text-muted-foreground">{entry.targetCount}問</span> : null}
                                            {entry.targetText ? <span className="ml-2 text-muted-foreground">{entry.targetText}</span> : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
    );
}
