import { addDaysToDateKey, normalizeTimeZone, parseDateKeyAsUTC } from '@/lib/date-key';
import type { DraftGranularity, GoalDraftProposal, GoalType, StudentGoalView } from '@/lib/types/student-goal';

export type SubjectOption = {
    id: string;
    name: string;
};

export type EditableMilestone = {
    dateKey: string;
    targetCount: number | null;
    targetText: string | null;
};

export type EditableGoal = {
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

export type DayDraftMap = Record<string, { targetCount: string; targetText: string }>;

export type DraftDialogState = {
    goalId: string;
    proposals: GoalDraftProposal[];
    selectedDateKeys: string[];
};

export const MAX_ACTIVE_GOALS = 10;

export function formatDateKeyLabel(dateKey: string, timeZone: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: normalizeTimeZone(timeZone),
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
}

export function formatMonthLabel(dateKey: string, timeZone: string) {
    const [year, month] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: normalizeTimeZone(timeZone),
        year: 'numeric',
        month: 'long',
    }).format(date);
}

export function hasGoalValue(targetCount: number | null, targetText: string | null | undefined): boolean {
    if (targetCount !== null) return true;
    return !!(targetText && targetText.trim().length > 0);
}

export function resolveGoalValueForDate(goal: EditableGoal, dateKey: string) {
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

export function resolveStudentGoalValueForDate(goal: StudentGoalView, dateKey: string) {
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

export function upsertMilestone(milestones: EditableMilestone[], nextMilestone: EditableMilestone): EditableMilestone[] {
    const byDate = new Map<string, EditableMilestone>();

    for (const milestone of milestones) {
        byDate.set(milestone.dateKey, milestone);
    }
    byDate.set(nextMilestone.dateKey, nextMilestone);

    return Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildEditableGoal(goal: StudentGoalView): EditableGoal {
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

export function createTemporaryGoal(params: {
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
        name: isProblem ? `${defaultSubject?.name ?? '科目'}の問題数` : '任意目標',
        dueDateKey,
        subjectId: isProblem ? defaultSubject?.id ?? null : null,
        subjectName: isProblem ? defaultSubject?.name ?? null : null,
        periodTargetCount: null,
        periodTargetText: '',
        draftGranularity: 'WEEKLY',
        milestones: [],
    };
}

export function getGoalTypeLabel(type: GoalType): string {
    return type === 'PROBLEM_COUNT' ? '問題数目標' : '任意目標';
}

export function getRelativeDateLabel(dateKey: string, todayKey: string, tomorrowKey: string): string | null {
    if (dateKey === todayKey) return '今日';
    if (dateKey === tomorrowKey) return '明日';
    return null;
}

export function getRemainingDays(baseDateKey: string, targetDateKey: string): number {
    const base = parseDateKeyAsUTC(baseDateKey).getTime();
    const target = parseDateKeyAsUTC(targetDateKey).getTime();
    return Math.floor((target - base) / (24 * 60 * 60 * 1000));
}

export function toGoalValueLabel(entry: {
    goalType: GoalType;
    targetCount: number | null;
    targetText: string | null;
}): string {
    if (entry.goalType === 'PROBLEM_COUNT') {
        const countLabel = entry.targetCount !== null ? `${entry.targetCount}問` : '未設定';
        return entry.targetText ? `${countLabel} / ${entry.targetText}` : countLabel;
    }

    const pieces: string[] = [];
    if (entry.targetText) pieces.push(entry.targetText);
    if (entry.targetCount !== null) pieces.push(String(entry.targetCount));
    return pieces.length > 0 ? pieces.join(' / ') : '未設定';
}
