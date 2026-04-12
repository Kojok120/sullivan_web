'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
    CalendarClock,
    Clock3,
    PencilLine,
    Plus,
    RefreshCcw,
    Save,
    Sparkles,
    Target,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { getGoalDailyViewAction } from '@/app/actions/student-goals';
import {
    deleteStudentGoalAction,
    generateStudentGoalDraftAction,
    renameStudentGoalAction,
    saveStudentGoalsAction,
    updateStudentGoalDayAction,
} from '@/app/teacher/students/[userId]/actions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { SimpleCalendar } from '@/components/ui/simple-calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { addDaysToDateKey, getBrowserTimeZoneSafe, normalizeTimeZone, parseDateKeyAsUTC } from '@/lib/date-key';
import {
    formatGoalDateKeyLabel,
    formatGoalMonthLabel,
    getGoalRelativeDateLabel,
    hasGoalTargetValue,
    resolveGoalTargetForDate,
} from '@/lib/student-goal-ui';
import { cn } from '@/lib/utils';
import type {
    DraftGranularity,
    GoalDailyViewPayload,
    GoalDraftProposal,
    GoalType,
    StudentGoalView,
} from '@/lib/types/student-goal';

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

function getGoalTypeLabel(type: GoalType): string {
    return type === 'PROBLEM_COUNT' ? '問題数目標' : '任意目標';
}

function getRemainingDays(baseDateKey: string, targetDateKey: string): number {
    const base = parseDateKeyAsUTC(baseDateKey).getTime();
    const target = parseDateKeyAsUTC(targetDateKey).getTime();
    return Math.floor((target - base) / (24 * 60 * 60 * 1000));
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
    const [goalTabValue, setGoalTabValue] = useState<'definition' | 'daily'>('definition');
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const todayRef = useRef<HTMLButtonElement | null>(null);

    const persistedGoals = useMemo(
        () => goals.filter((goal) => goal.persisted),
        [goals]
    );

    const todayEntries = useMemo(() => data.rows.find((row) => row.dateKey === data.todayKey)?.entries ?? [], [data]);

    const selectedDateEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === selectedDateKey)?.entries ?? [],
        [data, selectedDateKey]
    );

    const selectedDateStats = useMemo(() => {
        let problemTotal = 0;
        let customCount = 0;

        for (const entry of selectedDateEntries) {
            if (entry.goalType === 'PROBLEM_COUNT') {
                problemTotal += entry.targetCount ?? 0;
            } else {
                customCount += 1;
            }
        }

        return {
            allCount: selectedDateEntries.length,
            problemTotal,
            customCount,
        };
    }, [selectedDateEntries]);

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
            if (prev < result.data.fromDateKey || prev > result.data.toDateKey) {
                return result.data.todayKey;
            }
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
            const resolved = resolveGoalTargetForDate(goal.milestones, selectedDateKey);
            nextDraft[goal.id] = {
                targetCount: resolved.targetCount !== null ? String(resolved.targetCount) : '',
                targetText: resolved.targetText ?? '',
            };
        }

        setDayDraft(nextDraft);
    }, [persistedGoals, selectedDateKey]);

    useEffect(() => {
        if (!timelineRef.current || !todayRef.current || goalTabValue !== 'daily') return;

        const container = timelineRef.current;
        const row = todayRef.current;
        const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, [data, goalTabValue]);

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
            let milestones = goal.milestones.filter((milestone) => hasGoalTargetValue(milestone.targetCount, milestone.targetText));

            if (hasGoalTargetValue(goal.periodTargetCount, goal.periodTargetText)) {
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
            [goalId]: !prev[goalId],
        }));
    }

    const selectedRelativeLabel = getGoalRelativeDateLabel(selectedDateKey, data.todayKey, data.tomorrowKey);

    return (
        <div className="space-y-4">
            <Card className="border-primary/30 bg-accent">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">目標管理ダッシュボード</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">
                                目標設計と日次編集を分けて操作できます
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">TZ: {timeZone}</Badge>
                            <Badge variant="outline">有効目標 {goals.length}/{MAX_ACTIVE_GOALS}</Badge>
                            <Badge variant="outline">今日 {todayEntries.length}件</Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {todayEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">今日の目標は未設定です</p>
                    ) : (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {todayEntries.map((entry) => (
                                <div key={`${entry.goalId}-${entry.dueDateKey}`} className="rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm">
                                    <p className="font-semibold">{entry.subjectName || entry.goalName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {entry.targetCount !== null ? `${entry.targetCount}問` : '-'}
                                        {entry.targetText ? ` / ${entry.targetText}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                    {refreshing ? <p className="mt-2 text-xs text-muted-foreground">ブラウザTZに同期中...</p> : null}
                </CardContent>
            </Card>

            <Tabs value={goalTabValue} onValueChange={(value) => setGoalTabValue(value as 'definition' | 'daily')} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="definition">1. 目標設計</TabsTrigger>
                    <TabsTrigger value="daily">2. 日次編集</TabsTrigger>
                </TabsList>

                <TabsContent value="definition" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle className="text-base">目標一覧（期限・目標値・AI下書き）</CardTitle>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            if (goals.length >= MAX_ACTIVE_GOALS) {
                                                toast.error(`有効目標は最大${MAX_ACTIVE_GOALS}件です`);
                                                return;
                                            }
                                            setGoals((prev) => [
                                                ...prev,
                                                createTemporaryGoal({
                                                    type: 'PROBLEM_COUNT',
                                                    todayKey: data.todayKey,
                                                    subjects,
                                                }),
                                            ]);
                                        }}
                                    >
                                        <Plus className="mr-1 h-4 w-4" />
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
                                            setGoals((prev) => [
                                                ...prev,
                                                createTemporaryGoal({
                                                    type: 'CUSTOM',
                                                    todayKey: data.todayKey,
                                                    subjects,
                                                }),
                                            ]);
                                        }}
                                    >
                                        <Plus className="mr-1 h-4 w-4" />
                                        任意目標を追加
                                    </Button>
                                    <Button type="button" size="sm" onClick={handleSaveGoals} disabled={savingAll}>
                                        <Save className="mr-1 h-4 w-4" />
                                        {savingAll ? '保存中...' : '目標を保存'}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {goals.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3 py-8 text-sm text-muted-foreground">有効な目標はありません</p>
                            ) : (
                                <Accordion type="multiple" className="rounded-lg border">
                                    {goals.map((goal) => {
                                        const remainingDays = getRemainingDays(data.todayKey, goal.dueDateKey);

                                        return (
                                            <AccordionItem key={goal.id} value={goal.id} className="px-4">
                                                <AccordionTrigger className="hover:no-underline">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="truncate text-sm font-semibold">{goal.name}</span>
                                                            <Badge variant="outline" className="text-[11px]">{getGoalTypeLabel(goal.type)}</Badge>
                                                            <Badge variant="outline" className="text-[11px]">{formatGoalDateKeyLabel(goal.dueDateKey, timeZone)}まで</Badge>
                                                            <Badge variant="secondary" className="text-[11px]">残り{Math.max(0, remainingDays)}日</Badge>
                                                            {!goal.persisted ? (
                                                                <Badge className="text-[11px]" variant="secondary">未保存</Badge>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="space-y-4 pb-5">
                                                    <div className="grid gap-3 xl:grid-cols-12">
                                                        <div className="space-y-1.5 xl:col-span-5">
                                                            <label className="text-xs text-muted-foreground">目標名</label>
                                                            <Input
                                                                value={goal.name}
                                                                onChange={(event) => {
                                                                    const nextName = event.target.value;
                                                                    updateGoal(goal.id, (current) => ({ ...current, name: nextName }));
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="space-y-1.5 xl:col-span-3">
                                                            <label className="text-xs text-muted-foreground">期限</label>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="w-full justify-start"
                                                                onClick={() => toggleCalendar(goal.id)}
                                                            >
                                                                <CalendarClock className="mr-2 h-4 w-4" />
                                                                {formatGoalDateKeyLabel(goal.dueDateKey, timeZone)}
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

                                                        <div className="space-y-1.5 xl:col-span-2">
                                                            <label className="text-xs text-muted-foreground">種別</label>
                                                            <Input value={getGoalTypeLabel(goal.type)} disabled />
                                                        </div>

                                                        <div className="flex items-end gap-2 xl:col-span-2">
                                                            {goal.persisted ? (
                                                                <Button type="button" variant="outline" size="sm" onClick={() => handleRenameGoal(goal.id)}>
                                                                    <PencilLine className="mr-1 h-4 w-4" />
                                                                    改名を即時反映
                                                                </Button>
                                                            ) : null}
                                                            <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteGoal(goal.id)}>
                                                                <Trash2 className="mr-1 h-4 w-4" />
                                                                削除
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {goal.type === 'PROBLEM_COUNT' ? (
                                                        <div className="grid gap-3 lg:grid-cols-2">
                                                            <div className="space-y-1.5">
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

                                                            <div className="space-y-1.5">
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
                                                        <div className="space-y-1.5">
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

                                                    <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
                                                        <div className="flex flex-wrap items-center gap-2">
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
                                                                <SelectTrigger className="w-[190px]">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="HALF">半分</SelectItem>
                                                                    <SelectItem value="WEEKLY">1週間ごと</SelectItem>
                                                                    <SelectItem value="DAILY">毎日</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <Button type="button" size="sm" onClick={() => handleGenerateDraft(goal)}>
                                                                <Sparkles className="mr-1 h-4 w-4" />
                                                                下書き生成
                                                            </Button>
                                                        </div>
                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                            下書きは未保存です。比較ダイアログで適用後に「目標を保存」を押してください。
                                                        </p>
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        );
                                    })}
                                </Accordion>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="daily" className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <CardTitle className="text-base">日付タイムライン</CardTitle>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSelectedDateKey(data.todayKey);
                                            if (!timelineRef.current || !todayRef.current) return;
                                            const container = timelineRef.current;
                                            const row = todayRef.current;
                                            const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
                                            container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                                        }}
                                    >
                                        <RefreshCcw className="mr-1 h-4 w-4" />
                                        今日へ戻る
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">過去半年〜未来半年を全日表示</p>
                            </CardHeader>
                            <CardContent>
                                <div ref={timelineRef} className="max-h-[600px] overflow-y-auto rounded-lg border border-border/70">
                                    {data.rows.map((row, index) => {
                                        const prevMonth = data.rows[index - 1]?.dateKey.slice(0, 7);
                                        const monthChanged = prevMonth !== row.dateKey.slice(0, 7);
                                        const isToday = row.dateKey === data.todayKey;
                                        const isSelected = row.dateKey === selectedDateKey;
                                        const relativeLabel = getGoalRelativeDateLabel(row.dateKey, data.todayKey, data.tomorrowKey);

                                        return (
                                            <div key={row.dateKey}>
                                                {monthChanged ? (
                                                    <div className="sticky top-0 z-10 border-y bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                                                        {formatGoalMonthLabel(row.dateKey, timeZone)}
                                                    </div>
                                                ) : null}

                                                <button
                                                    type="button"
                                                    ref={isToday ? todayRef : null}
                                                    onClick={() => setSelectedDateKey(row.dateKey)}
                                                    className={cn(
                                                        'w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                                                        isSelected && 'bg-primary/[0.08] ring-1 ring-primary/30',
                                                        isToday && !isSelected && 'bg-accent/45'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-sm font-medium">{formatGoalDateKeyLabel(row.dateKey, timeZone)}</p>
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
                                        <CardTitle className="text-base">{formatGoalDateKeyLabel(selectedDateKey, timeZone)} の目標編集</CardTitle>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {selectedRelativeLabel ? `${selectedRelativeLabel}の編集` : '選択日の編集'}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleSaveSelectedDay}
                                        disabled={savingDay || persistedGoals.length === 0}
                                    >
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
                                                        {formatGoalDateKeyLabel(goal.dueDateKey, timeZone)}まで
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
                                                                setDayDraft((prev) => {
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
                                                                setDayDraft((prev) => {
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
            </Tabs>

            <Dialog open={!!draftDialog} onOpenChange={(open) => !open && setDraftDialog(null)}>
                <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>AI下書き比較</DialogTitle>
                        <DialogDescription>
                            適用したい日付を選択してください。保存はまだ実行されません。
                        </DialogDescription>
                    </DialogHeader>

                    {draftDialog ? (
                        <div className="space-y-2">
                            {draftDialog.proposals.map((proposal) => {
                                const goal = goals.find((item) => item.id === draftDialog.goalId);
                                const currentValue = goal
                                    ? resolveGoalTargetForDate(goal.milestones, proposal.dateKey)
                                    : { targetCount: null, targetText: null };
                                const checked = draftDialog.selectedDateKeys.includes(proposal.dateKey);

                                return (
                                    <label key={proposal.dateKey} className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={(nextChecked) => {
                                                const isChecked = nextChecked === true;
                                                const nextSelected = isChecked
                                                    ? [...draftDialog.selectedDateKeys, proposal.dateKey]
                                                    : draftDialog.selectedDateKeys.filter((key) => key !== proposal.dateKey);

                                                setDraftDialog((prev) => (prev ? { ...prev, selectedDateKeys: nextSelected } : prev));
                                            }}
                                        />
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-sm font-semibold">{formatGoalDateKeyLabel(proposal.dateKey, timeZone)}</div>
                                                <Badge variant="outline" className="text-[11px]">提案</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                現在値: {currentValue.targetCount !== null ? `${currentValue.targetCount}問` : '-'}
                                                {currentValue.targetText ? ` / ${currentValue.targetText}` : ''}
                                            </div>
                                            <div className="text-xs">
                                                提案値: {proposal.targetCount !== null && proposal.targetCount !== undefined ? `${proposal.targetCount}問` : '-'}
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
