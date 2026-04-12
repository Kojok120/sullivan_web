import { normalizeTimeZone } from '@/lib/date-key';

type GoalValueMilestone = {
    dateKey: string;
    targetCount: number | null | undefined;
    targetText: string | null | undefined;
};

export function formatGoalDateKeyLabel(dateKey: string, timeZone: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: normalizeTimeZone(timeZone),
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
}

export function formatGoalMonthLabel(dateKey: string, timeZone: string) {
    const [year, month] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: normalizeTimeZone(timeZone),
        year: 'numeric',
        month: 'long',
    }).format(date);
}

export function getGoalRelativeDateLabel(dateKey: string, todayKey: string, tomorrowKey: string): string | null {
    if (dateKey === todayKey) return '今日';
    if (dateKey === tomorrowKey) return '明日';
    return null;
}

export function hasGoalTargetValue(targetCount: number | null | undefined, targetText: string | null | undefined) {
    if (targetCount !== null && targetCount !== undefined) return true;
    return !!(targetText && targetText.trim().length > 0);
}

export function resolveGoalTargetForDate(milestones: readonly GoalValueMilestone[], dateKey: string) {
    let targetCount: number | null = null;
    let targetText: string | null = null;

    for (const milestone of milestones) {
        if (milestone.dateKey > dateKey) {
            break;
        }

        if (hasGoalTargetValue(milestone.targetCount, milestone.targetText)) {
            targetCount = milestone.targetCount ?? null;
            targetText = milestone.targetText ?? null;
        }
    }

    return {
        targetCount,
        targetText,
    };
}
