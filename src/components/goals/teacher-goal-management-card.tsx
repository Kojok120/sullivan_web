'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { toast } from 'sonner';

import { getGoalDailyViewAction } from '@/app/actions/student-goals';
import {
    deleteStudentGoalAction,
    generateStudentGoalDraftAction,
    renameStudentGoalAction,
    saveStudentGoalsAction,
    updateStudentGoalDayAction,
} from '@/app/teacher/students/[userId]/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { addDaysToDateKey, getBrowserTimeZoneSafe, normalizeTimeZone } from '@/lib/date-key';
import type { DraftGranularity, GoalDailyViewPayload, GoalDraftProposal, GoalType, StudentGoalView } from '@/lib/types/student-goal';
import { SimpleCalendar } from '@/components/ui/simple-calendar';

type SubjectOption = {
    id: string;
    name: string;
};

type TeacherGoalManagementCardProps = {
    studentId: string;
    subjects: SubjectOption[];
    initialData: GoalDailyViewPayload;
};

type EditableMilestone = {
    dateKey: string;
    targetCount: number | null;
    targetText: string | null;
};

type EditableGoal = {
    id: string;
    persisted: boolean;
    type: GoalType;
    name: string;
    dueDateKey: string;
    subjectId: string | null;
    subjectName: string | null;
    periodTargetCount: number | null;
    periodTargetText: string;
    draftGranularity: DraftGranularity;
    milestones: EditableMilestone[];
};

type DraftDialogState = {
    goalId: string;
    proposals: GoalDraftProposal[];
    selectedDateKeys: string[];
};

const MAX_ACTIVE_GOALS = 10;

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

function hasGoalValue(targetCount: number | null, targetText: string | null | undefined): boolean {
    if (targetCount !== null) return true;
    return !!(targetText && targetText.trim().length > 0);
}

function resolveGoalValueForDate(goal: EditableGoal, dateKey: string) {
    let count: number | null = null;
    let text: string | null = null;

    for (const milestone of goal.milestones) {
        if (milestone.dateKey > dateKey) break;
        if (hasGoalValue(milestone.targetCount, milestone.targetText)) {
            count = milestone.targetCount;
            text = milestone.targetText;
        }
    }

    return { targetCount: count, targetText: text };
}

function upsertMilestone(milestones: EditableMilestone[], nextMilestone: EditableMilestone): EditableMilestone[] {
    const byDate = new Map<string, EditableMilestone>();

    for (const milestone of milestones) {
        byDate.set(milestone.dateKey, milestone);
    }
    byDate.set(nextMilestone.dateKey, nextMilestone);

    return Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function buildEditableGoal(goal: StudentGoalView): EditableGoal {
    const dueMilestone = goal.milestones.find((milestone) => milestone.dateKey === goal.dueDateKey);

    return {
        id: goal.id,
        persisted: true,
        type: goal.type,
        name: goal.name,
        dueDateKey: goal.dueDateKey,
        subjectId: goal.subjectId,
        subjectName: goal.subjectName,
        periodTargetCount: dueMilestone?.targetCount ?? null,
        periodTargetText: dueMilestone?.targetText ?? '',
        draftGranularity: 'WEEKLY',
        milestones: goal.milestones.map((milestone) => ({
            dateKey: milestone.dateKey,
            targetCount: milestone.targetCount,
            targetText: milestone.targetText,
        })),
    };
}

function createTemporaryGoal(params: {
    type: GoalType;
    todayKey: string;
    subjects: SubjectOption[];
}): EditableGoal {
    const defaultSubject = params.subjects[0] ?? null;
    const isProblem = params.type === 'PROBLEM_COUNT';
    const dueDateKey = addDaysToDateKey(params.todayKey, 7);

    return {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        persisted: false,
        type: params.type,
        name: isProblem
            ? `${defaultSubject?.name ?? '科目'}の問題数`
            : '任意目標',
        dueDateKey,
        subjectId: isProblem ? defaultSubject?.id ?? null : null,
        subjectName: isProblem ? defaultSubject?.name ?? null : null,
        periodTargetCount: null,
        periodTargetText: '',
        draftGranularity: 'WEEKLY',
        milestones: [],
    };
}

export function TeacherGoalManagementCard({ studentId, subjects, initialData }: TeacherGoalManagementCardProps) {
    const [timeZone, setTimeZone] = useState(initialData.timeZone);
    const [data, setData] = useState(initialData);
    const [goals, setGoals] = useState<EditableGoal[]>(() => initialData.activeGoals.map(buildEditableGoal));
    const [selectedDateKey, setSelectedDateKey] = useState(initialData.todayKey);
    const [dayDraft, setDayDraft] = useState<Record<string, { targetCount: string; targetText: string }>>({});
    const [draftDialog, setDraftDialog] = useState<DraftDialogState | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [savingDay, setSavingDay] = useState(false);
    const [refreshing, startTransition] = useTransition();
    const [calendarOpenByGoalId, setCalendarOpenByGoalId] = useState<Record<string, boolean>>({});
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const todayRef = useRef<HTMLButtonElement | null>(null);

    const persistedGoals = useMemo(
        () => goals.filter((goal) => goal.persisted),
        [goals]
    );

    async function refreshGoalData(targetTimeZone?: string) {
        const safeTimeZone = normalizeTimeZone(targetTimeZone ?? timeZone);
        const result = await getGoalDailyViewAction({
            studentId,
            timeZone: safeTimeZone,
        });

        if (!result.success || !result.data) {
            toast.error(result.error ?? '目標データの再取得に失敗しました');
            return;
        }

        setTimeZone(safeTimeZone);
        setData(result.data);
        setGoals(result.data.activeGoals.map(buildEditableGoal));
        setSelectedDateKey((prev) => {
            if (prev < result.data.fromDateKey) return result.data.todayKey;
            if (prev > result.data.toDateKey) return result.data.todayKey;
            return prev;
        });
    }

    useEffect(() => {
        const browserTimeZone = getBrowserTimeZoneSafe();
        startTransition(() => {
            void refreshGoalData(browserTimeZone);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId]);

    useEffect(() => {
        const nextDraft: Record<string, { targetCount: string; targetText: string }> = {};

        for (const goal of persistedGoals) {
            const resolved = resolveGoalValueForDate(goal, selectedDateKey);
            nextDraft[goal.id] = {
                targetCount: resolved.targetCount !== null ? String(resolved.targetCount) : '',
                targetText: resolved.targetText ?? '',
            };
        }

        setDayDraft(nextDraft);
    }, [persistedGoals, selectedDateKey]);

    useEffect(() => {
        if (!timelineRef.current || !todayRef.current) return;

        const container = timelineRef.current;
        const row = todayRef.current;
        const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, [data]);

    const todayEntries = useMemo(() => data.rows.find((row) => row.dateKey === data.todayKey)?.entries ?? [], [data]);
    const selectedDateEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === selectedDateKey)?.entries ?? [],
        [data, selectedDateKey]
    );

    function updateGoal(goalId: string, updater: (goal: EditableGoal) => EditableGoal) {
        setGoals((prev) => prev.map((goal) => (goal.id === goalId ? updater(goal) : goal)));
    }

    function applyDraft(goalId: string, proposals: GoalDraftProposal[]) {
        updateGoal(goalId, (goal) => {
            let nextMilestones = [...goal.milestones];

            for (const proposal of proposals) {
                nextMilestones = upsertMilestone(nextMilestones, {
                    dateKey: proposal.dateKey,
                    targetCount: proposal.targetCount ?? null,
                    targetText: proposal.targetText ?? null,
                });
            }

            const dueMilestone = nextMilestones.find((milestone) => milestone.dateKey === goal.dueDateKey);

            return {
                ...goal,
                milestones: nextMilestones,
                periodTargetCount: dueMilestone?.targetCount ?? goal.periodTargetCount,
                periodTargetText: dueMilestone?.targetText ?? goal.periodTargetText,
            };
        });
    }

    async function handleGenerateDraft(goal: EditableGoal) {
        if (goal.dueDateKey < data.todayKey) {
            toast.error('期限日は今日以降を選択してください');
            return;
        }

        const result = await generateStudentGoalDraftAction(studentId, {
            goal: {
                type: goal.type,
                name: goal.name,
                dueDateKey: goal.dueDateKey,
                subjectName: goal.subjectName,
                targetCount: goal.periodTargetCount,
                targetText: goal.periodTargetText || null,
                milestones: goal.milestones,
            },
            granularity: goal.draftGranularity,
            timeZone,
        });

        if (!result.success || !result.data) {
            toast.error(result.error ?? '下書き生成に失敗しました');
            return;
        }

        setDraftDialog({
            goalId: goal.id,
            proposals: result.data,
            selectedDateKeys: result.data.map((item) => item.dateKey),
        });
    }

    async function handleSaveGoals() {
        setSavingAll(true);

        const payload = goals.map((goal) => {
            let milestones = goal.milestones.filter((milestone) => hasGoalValue(milestone.targetCount, milestone.targetText));

            if (hasGoalValue(goal.periodTargetCount, goal.periodTargetText)) {
                milestones = upsertMilestone(milestones, {
                    dateKey: goal.dueDateKey,
                    targetCount: goal.periodTargetCount,
                    targetText: goal.periodTargetText || null,
                });
            }

            return {
                id: goal.persisted ? goal.id : undefined,
                type: goal.type,
                name: goal.name,
                dueDateKey: goal.dueDateKey,
                subjectId: goal.type === 'PROBLEM_COUNT' ? goal.subjectId : null,
                milestones,
            };
        });

        const result = await saveStudentGoalsAction(studentId, {
            goals: payload,
            timeZone,
        });

        setSavingAll(false);

        if (!result.success) {
            toast.error(result.error ?? '目標保存に失敗しました');
            return;
        }

        toast.success('目標を保存しました');
        await refreshGoalData(timeZone);
    }

    async function handleSaveSelectedDay() {
        setSavingDay(true);

        const entries = persistedGoals.map((goal) => {
            const draft = dayDraft[goal.id];
            const parsedCount = draft?.targetCount?.trim() ? Number(draft.targetCount) : null;
            const safeCount = Number.isFinite(parsedCount) && parsedCount !== null ? Math.max(0, Math.floor(parsedCount)) : null;
            return {
                goalId: goal.id,
                targetCount: safeCount,
                targetText: draft?.targetText?.trim() ? draft.targetText.trim() : null,
            };
        });

        const result = await updateStudentGoalDayAction(studentId, {
            dateKey: selectedDateKey,
            timeZone,
            entries,
        });

        setSavingDay(false);

        if (!result.success) {
            toast.error(result.error ?? '日次目標の保存に失敗しました');
            return;
        }

        toast.success('日次目標を保存しました');
        await refreshGoalData(timeZone);
    }

    async function handleRenameGoal(goalId: string) {
        const goal = goals.find((item) => item.id === goalId);
        if (!goal || !goal.persisted) {
            return;
        }

        const result = await renameStudentGoalAction(goal.id, goal.name);
        if (!result.success) {
            toast.error(result.error ?? '目標名の更新に失敗しました');
            return;
        }

        toast.success('目標名を更新しました');
        await refreshGoalData(timeZone);
    }

    async function handleDeleteGoal(goalId: string) {
        const goal = goals.find((item) => item.id === goalId);
        if (!goal) return;

        if (!confirm('この目標を削除しますか？')) return;

        if (!goal.persisted) {
            setGoals((prev) => prev.filter((item) => item.id !== goalId));
            return;
        }

        const result = await deleteStudentGoalAction(goal.id);
        if (!result.success) {
            toast.error(result.error ?? '目標削除に失敗しました');
            return;
        }

        toast.success('目標を削除しました');
        await refreshGoalData(timeZone);
    }

    function toggleCalendar(goalId: string) {
        setCalendarOpenByGoalId((prev) => ({
            ...prev,
            [goalId]: !prev[goalId],
        }));
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">今日の目標（講師確認）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {todayEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">今日の目標は未設定です</p>
                    ) : (
                        todayEntries.map((entry) => (
                            <div key={`${entry.goalId}-${entry.dueDateKey}`} className="text-sm">
                                <span className="font-medium">{entry.goalName}</span>
                                {entry.subjectName ? <span className="ml-2 text-muted-foreground">{entry.subjectName}</span> : null}
                                {entry.targetCount !== null ? <span className="ml-2 text-muted-foreground">{entry.targetCount}問</span> : null}
                                {entry.targetText ? <span className="ml-2 text-muted-foreground">{entry.targetText}</span> : null}
                            </div>
                        ))
                    )}
                    {refreshing ? <p className="text-xs text-muted-foreground">タイムゾーン同期中...</p> : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">目標管理</CardTitle>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (goals.length >= MAX_ACTIVE_GOALS) {
                                    toast.error(`有効目標は最大${MAX_ACTIVE_GOALS}件です`);
                                    return;
                                }
                                setGoals((prev) => [...prev, createTemporaryGoal({ type: 'PROBLEM_COUNT', todayKey: data.todayKey, subjects })]);
                            }}
                        >
                            問題数目標を追加
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (goals.length >= MAX_ACTIVE_GOALS) {
                                    toast.error(`有効目標は最大${MAX_ACTIVE_GOALS}件です`);
                                    return;
                                }
                                setGoals((prev) => [...prev, createTemporaryGoal({ type: 'CUSTOM', todayKey: data.todayKey, subjects })]);
                            }}
                        >
                            任意目標を追加
                        </Button>
                        <Button type="button" size="sm" onClick={handleSaveGoals} disabled={savingAll}>
                            {savingAll ? '保存中...' : '目標を保存'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {goals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">有効な目標はありません</p>
                    ) : (
                        goals.map((goal) => (
                            <div key={goal.id} className="space-y-3 rounded-md border p-3">
                                <div className="grid gap-3 lg:grid-cols-12">
                                    <div className="space-y-2 lg:col-span-5">
                                        <label className="text-xs text-muted-foreground">目標名</label>
                                        <Input
                                            value={goal.name}
                                            onChange={(event) => {
                                                const nextName = event.target.value;
                                                updateGoal(goal.id, (current) => ({ ...current, name: nextName }));
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2 lg:col-span-3">
                                        <label className="text-xs text-muted-foreground">期限</label>
                                        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => toggleCalendar(goal.id)}>
                                            {formatDateKeyLabel(goal.dueDateKey, timeZone)}
                                        </Button>
                                        {calendarOpenByGoalId[goal.id] ? (
                                            <SimpleCalendar
                                                value={goal.dueDateKey}
                                                minDateKey={data.todayKey}
                                                onChange={(nextDateKey) => {
                                                    updateGoal(goal.id, (current) => ({ ...current, dueDateKey: nextDateKey }));
                                                }}
                                            />
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 lg:col-span-2">
                                        <label className="text-xs text-muted-foreground">種別</label>
                                        <Input value={goal.type === 'PROBLEM_COUNT' ? '問題数' : '任意'} disabled />
                                    </div>
                                    <div className="flex items-end gap-2 lg:col-span-2">
                                        {goal.persisted ? (
                                            <Button type="button" variant="outline" size="sm" onClick={() => handleRenameGoal(goal.id)}>
                                                改名
                                            </Button>
                                        ) : null}
                                        <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteGoal(goal.id)}>
                                            削除
                                        </Button>
                                    </div>
                                </div>

                                {goal.type === 'PROBLEM_COUNT' ? (
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-xs text-muted-foreground">科目</label>
                                            <Select
                                                value={goal.subjectId ?? ''}
                                                onValueChange={(value) => {
                                                    const selectedSubject = subjects.find((subject) => subject.id === value);
                                                    updateGoal(goal.id, (current) => ({
                                                        ...current,
                                                        subjectId: value,
                                                        subjectName: selectedSubject?.name ?? null,
                                                        name: selectedSubject ? `${selectedSubject.name}の問題数` : current.name,
                                                    }));
                                                }}
                                            >
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
                                        <div className="space-y-2">
                                            <label className="text-xs text-muted-foreground">期限までの目安問題数</label>
                                            <Input
                                                type="number"
                                                min={0}
                                                value={goal.periodTargetCount ?? ''}
                                                onChange={(event) => {
                                                    const raw = event.target.value;
                                                    updateGoal(goal.id, (current) => ({
                                                        ...current,
                                                        periodTargetCount: raw.trim().length === 0 ? null : Math.max(0, Math.floor(Number(raw))),
                                                    }));
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">期限までの目標内容</label>
                                        <Textarea
                                            value={goal.periodTargetText}
                                            onChange={(event) => {
                                                const nextText = event.target.value;
                                                updateGoal(goal.id, (current) => ({
                                                    ...current,
                                                    periodTargetText: nextText,
                                                }));
                                            }}
                                        />
                                    </div>
                                )}

                                <div className="rounded-md border bg-muted/20 p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">AI下書き</Badge>
                                        <Select
                                            value={goal.draftGranularity}
                                            onValueChange={(value) => {
                                                updateGoal(goal.id, (current) => ({
                                                    ...current,
                                                    draftGranularity: value as DraftGranularity,
                                                }));
                                            }}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="HALF">半分</SelectItem>
                                                <SelectItem value="WEEKLY">1週間ごと</SelectItem>
                                                <SelectItem value="DAILY">毎日</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" size="sm" onClick={() => handleGenerateDraft(goal)}>
                                            下書き生成
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        下書きは保存されません。比較モーダルで適用してから「目標を保存」を押してください。
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-12">
                <Card className="lg:col-span-5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">日付タイムライン（過去半年〜未来半年）</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div ref={timelineRef} className="max-h-[560px] overflow-y-auto rounded-md border">
                            {data.rows.map((row) => {
                                const isToday = row.dateKey === data.todayKey;
                                const isSelected = row.dateKey === selectedDateKey;
                                return (
                                    <button
                                        key={row.dateKey}
                                        type="button"
                                        ref={isToday ? todayRef : null}
                                        onClick={() => setSelectedDateKey(row.dateKey)}
                                        className={`w-full border-b p-3 text-left last:border-0 ${isToday ? 'bg-accent/40' : ''} ${isSelected ? 'ring-2 ring-primary/40' : ''}`}
                                    >
                                        <div className="text-sm font-medium">
                                            {formatDateKeyLabel(row.dateKey, timeZone)}
                                            {isToday ? <span className="ml-2 text-xs text-primary">今日</span> : null}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {row.entries.length > 0 ? `${row.entries.length}件` : '未設定'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-7">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base">{formatDateKeyLabel(selectedDateKey, timeZone)} の目標編集</CardTitle>
                        <Button type="button" size="sm" onClick={handleSaveSelectedDay} disabled={savingDay || persistedGoals.length === 0}>
                            {savingDay ? '保存中...' : 'この日を保存'}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {persistedGoals.length === 0 ? (
                            <p className="text-sm text-muted-foreground">先に目標を保存すると日付編集が可能になります。</p>
                        ) : (
                            persistedGoals.map((goal) => {
                                const draft = dayDraft[goal.id] ?? { targetCount: '', targetText: '' };
                                return (
                                    <div key={goal.id} className="space-y-2 rounded-md border p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-medium">{goal.name}</div>
                                            <Badge variant="outline">{formatDateKeyLabel(goal.dueDateKey, timeZone)}まで</Badge>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">問題数</label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={draft.targetCount}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setDayDraft((prev) => ({
                                                            ...prev,
                                                            [goal.id]: {
                                                                ...prev[goal.id],
                                                                targetCount: value,
                                                            },
                                                        }));
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">内容</label>
                                                <Input
                                                    value={draft.targetText}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setDayDraft((prev) => ({
                                                            ...prev,
                                                            [goal.id]: {
                                                                ...prev[goal.id],
                                                                targetText: value,
                                                            },
                                                        }));
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div className="rounded-md border bg-muted/20 p-3 text-sm">
                            <div className="mb-2 font-medium">表示中の日付の反映済み内容</div>
                            {selectedDateEntries.length === 0 ? (
                                <div className="text-muted-foreground">未設定</div>
                            ) : (
                                <div className="space-y-1">
                                    {selectedDateEntries.map((entry) => (
                                        <div key={`${entry.goalId}-${selectedDateKey}`}>
                                            <span className="font-medium">{entry.goalName}</span>
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

            <Dialog open={!!draftDialog} onOpenChange={(open) => !open && setDraftDialog(null)}>
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>AI下書き比較</DialogTitle>
                        <DialogDescription>
                            適用したい日付を選んでください。保存はまだ行われません。
                        </DialogDescription>
                    </DialogHeader>

                    {draftDialog ? (
                        <div className="space-y-2">
                            {draftDialog.proposals.map((proposal) => {
                                const goal = goals.find((item) => item.id === draftDialog.goalId);
                                const currentValue = goal ? resolveGoalValueForDate(goal, proposal.dateKey) : { targetCount: null, targetText: null };
                                const checked = draftDialog.selectedDateKeys.includes(proposal.dateKey);

                                return (
                                    <label key={proposal.dateKey} className="flex items-start gap-3 rounded-md border p-3">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(event) => {
                                                const nextSelected = event.target.checked
                                                    ? [...draftDialog.selectedDateKeys, proposal.dateKey]
                                                    : draftDialog.selectedDateKeys.filter((key) => key !== proposal.dateKey);

                                                setDraftDialog((prev) => prev ? { ...prev, selectedDateKeys: nextSelected } : prev);
                                            }}
                                        />
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium">{formatDateKeyLabel(proposal.dateKey, timeZone)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                現在: {currentValue.targetCount !== null ? `${currentValue.targetCount}問` : '-'}
                                                {currentValue.targetText ? ` / ${currentValue.targetText}` : ''}
                                            </div>
                                            <div className="text-xs">
                                                提案: {proposal.targetCount !== null && proposal.targetCount !== undefined ? `${proposal.targetCount}問` : '-'}
                                                {proposal.targetText ? ` / ${proposal.targetText}` : ''}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    ) : null}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                if (!draftDialog) return;
                                const proposals = draftDialog.proposals.filter((proposal) => draftDialog.selectedDateKeys.includes(proposal.dateKey));
                                applyDraft(draftDialog.goalId, proposals);
                                setDraftDialog(null);
                            }}
                        >
                            選択日を適用
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!draftDialog) return;
                                applyDraft(draftDialog.goalId, draftDialog.proposals);
                                setDraftDialog(null);
                            }}
                        >
                            全提案を適用
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
