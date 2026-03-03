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
import { getBrowserTimeZoneSafe, normalizeTimeZone } from '@/lib/date-key';
import type { GoalDailyViewPayload, GoalType } from '@/lib/types/student-goal';

import {
    buildEditableGoal,
    createTemporaryGoal,
    getRelativeDateLabel,
    hasGoalValue,
    MAX_ACTIVE_GOALS,
    resolveGoalValueForDate,
    type DayDraftMap,
    type DraftDialogState,
    type EditableGoal,
    type SubjectOption,
    upsertMilestone,
} from './goal-view-utils';

export function useGoalManagement(params: {
    studentId: string;
    subjects: SubjectOption[];
    initialData: GoalDailyViewPayload;
}) {
    const { studentId, subjects, initialData } = params;

    const [timeZone, setTimeZone] = useState(initialData.timeZone);
    const [data, setData] = useState(initialData);
    const [goals, setGoals] = useState<EditableGoal[]>(() => initialData.activeGoals.map(buildEditableGoal));
    const [selectedDateKey, setSelectedDateKey] = useState(initialData.todayKey);
    const [dayDraft, setDayDraft] = useState<DayDraftMap>({});
    const [draftDialog, setDraftDialog] = useState<DraftDialogState | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [savingDay, setSavingDay] = useState(false);
    const [refreshing, startTransition] = useTransition();
    const [calendarOpenByGoalId, setCalendarOpenByGoalId] = useState<Record<string, boolean>>({});
    const [goalTabValue, setGoalTabValue] = useState<'definition' | 'daily'>('definition');
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const todayRef = useRef<HTMLButtonElement | null>(null);

    const persistedGoals = useMemo(() => goals.filter((goal) => goal.persisted), [goals]);
    const todayEntries = useMemo(() => data.rows.find((row) => row.dateKey === data.todayKey)?.entries ?? [], [data]);
    const selectedDateEntries = useMemo(
        () => data.rows.find((row) => row.dateKey === selectedDateKey)?.entries ?? [],
        [data, selectedDateKey],
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
        const nextDraft: DayDraftMap = {};

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
        if (!timelineRef.current || !todayRef.current || goalTabValue !== 'daily') return;

        const container = timelineRef.current;
        const row = todayRef.current;
        const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, [data, goalTabValue]);

    function updateGoal(goalId: string, updater: (goal: EditableGoal) => EditableGoal) {
        setGoals((prev) => prev.map((goal) => (goal.id === goalId ? updater(goal) : goal)));
    }

    function applyDraft(goalId: string, proposals: DraftDialogState['proposals']) {
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

        if ('error' in result) {
            toast.error(result.error ?? '下書き生成に失敗しました');
            return;
        }

        if (!result.success || !result.data) {
            toast.error('下書き生成に失敗しました');
            return;
        }

        setDraftDialog({
            goalId: goal.id,
            proposals: result.data,
            selectedDateKeys: result.data.map((item: { dateKey: string }) => item.dateKey),
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

        if ('error' in result) {
            toast.error(result.error ?? '目標保存に失敗しました');
            return;
        }

        if (!result.success) {
            toast.error('目標保存に失敗しました');
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

        if ('error' in result) {
            toast.error(result.error ?? '日次目標の保存に失敗しました');
            return;
        }

        if (!result.success) {
            toast.error('日次目標の保存に失敗しました');
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
        if ('error' in result) {
            toast.error(result.error ?? '目標名の更新に失敗しました');
            return;
        }

        if (!result.success) {
            toast.error('目標名の更新に失敗しました');
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
        if ('error' in result) {
            toast.error(result.error ?? '目標削除に失敗しました');
            return;
        }

        if (!result.success) {
            toast.error('目標削除に失敗しました');
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

    function handleAddGoal(type: GoalType) {
        if (goals.length >= MAX_ACTIVE_GOALS) {
            toast.error(`有効目標は最大${MAX_ACTIVE_GOALS}件です`);
            return;
        }

        setGoals((prev) => [
            ...prev,
            createTemporaryGoal({
                type,
                todayKey: data.todayKey,
                subjects,
            }),
        ]);
    }

    function scrollToToday() {
        setSelectedDateKey(data.todayKey);
        if (!timelineRef.current || !todayRef.current) return;
        const container = timelineRef.current;
        const row = todayRef.current;
        const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    const selectedRelativeLabel = getRelativeDateLabel(selectedDateKey, data.todayKey, data.tomorrowKey);

    return {
        timeZone,
        data,
        goals,
        persistedGoals,
        selectedDateKey,
        dayDraft,
        draftDialog,
        savingAll,
        savingDay,
        refreshing,
        goalTabValue,
        calendarOpenByGoalId,
        timelineRef,
        todayRef,
        todayEntries,
        selectedDateEntries,
        selectedDateStats,
        selectedRelativeLabel,
        setGoalTabValue,
        setSelectedDateKey,
        setDayDraft,
        setDraftDialog,
        updateGoal,
        applyDraft,
        handleGenerateDraft,
        handleSaveGoals,
        handleSaveSelectedDay,
        handleRenameGoal,
        handleDeleteGoal,
        toggleCalendar,
        handleAddGoal,
        scrollToToday,
    };
}
