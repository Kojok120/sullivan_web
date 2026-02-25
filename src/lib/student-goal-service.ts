import { prisma } from '@/lib/prisma';
import { addDaysToDateKey, getDateRangeAroundToday, getTodayDateKey, listDateKeysBetween, normalizeTimeZone } from '@/lib/date-key';
import type {
    DailyGoalEntry,
    DailyGoalRow,
    GoalDailyViewPayload,
    GoalType,
    StudentGoalView,
} from '@/lib/types/student-goal';

type StudentGoalWithRelations = Awaited<ReturnType<typeof fetchGoals>>[number];

const HALF_YEAR_DAYS = 183;

async function fetchGoals(params: {
    studentId: string;
    fromDateKey: string;
    toDateKey: string;
}) {
    return prisma.studentGoal.findMany({
        where: {
            studentId: params.studentId,
            deletedAt: null,
            dueDateKey: {
                gte: params.fromDateKey,
            },
        },
        include: {
            subject: {
                select: {
                    id: true,
                    name: true,
                },
            },
            milestones: {
                where: {
                    dateKey: {
                        lte: params.toDateKey,
                    },
                },
                orderBy: {
                    dateKey: 'asc',
                },
            },
        },
        orderBy: [
            { dueDateKey: 'asc' },
            { createdAt: 'asc' },
        ],
    });
}

function mapGoal(goal: StudentGoalWithRelations): StudentGoalView {
    return {
        id: goal.id,
        type: goal.type as GoalType,
        name: goal.name,
        dueDateKey: goal.dueDateKey,
        subjectId: goal.subjectId,
        subjectName: goal.subject?.name ?? null,
        milestones: goal.milestones.map((milestone) => ({
            id: milestone.id,
            dateKey: milestone.dateKey,
            targetCount: milestone.targetCount,
            targetText: milestone.targetText,
        })),
    };
}

function hasMilestoneValue(targetCount: number | null, targetText: string | null): boolean {
    if (targetCount !== null) return true;
    if (typeof targetText === 'string' && targetText.trim().length > 0) return true;
    return false;
}

function resolveGoalEntryForDate(goal: StudentGoalView, dateKey: string): DailyGoalEntry | null {
    if (goal.dueDateKey < dateKey) {
        return null;
    }

    let resolvedCount: number | null = null;
    let resolvedText: string | null = null;

    for (const milestone of goal.milestones) {
        if (milestone.dateKey > dateKey) {
            break;
        }

        if (hasMilestoneValue(milestone.targetCount, milestone.targetText)) {
            resolvedCount = milestone.targetCount;
            resolvedText = milestone.targetText;
        }
    }

    if (!hasMilestoneValue(resolvedCount, resolvedText)) {
        return null;
    }

    return {
        goalId: goal.id,
        goalType: goal.type,
        goalName: goal.name,
        subjectName: goal.subjectName,
        dueDateKey: goal.dueDateKey,
        targetCount: resolvedCount,
        targetText: resolvedText,
    };
}

function toRows(goals: StudentGoalView[], fromDateKey: string, toDateKey: string): DailyGoalRow[] {
    const rows: DailyGoalRow[] = [];
    const dateKeys = listDateKeysBetween(fromDateKey, toDateKey);

    for (const dateKey of dateKeys) {
        const entries = goals
            .map((goal) => resolveGoalEntryForDate(goal, dateKey))
            .filter((entry): entry is DailyGoalEntry => entry !== null)
            .sort((a, b) => a.goalName.localeCompare(b.goalName, 'ja'));

        rows.push({
            dateKey,
            entries,
        });
    }

    return rows;
}

export async function getGoalDailyViewPayload(params: {
    studentId: string;
    timeZone?: string | null;
    daysBefore?: number;
    daysAfter?: number;
}): Promise<GoalDailyViewPayload> {
    const safeTimeZone = normalizeTimeZone(params.timeZone);
    const daysBefore = params.daysBefore ?? HALF_YEAR_DAYS;
    const daysAfter = params.daysAfter ?? HALF_YEAR_DAYS;

    const { today, fromDateKey, toDateKey } = getDateRangeAroundToday(safeTimeZone, daysBefore, daysAfter);
    const tomorrow = addDaysToDateKey(today, 1);

    const goalsRaw = await fetchGoals({
        studentId: params.studentId,
        fromDateKey,
        toDateKey,
    });

    const goals = goalsRaw.map(mapGoal);
    const rows = toRows(goals, fromDateKey, toDateKey);
    const activeGoals = goals.filter((goal) => goal.dueDateKey >= today);

    return {
        timeZone: safeTimeZone,
        todayKey: today,
        tomorrowKey: tomorrow,
        fromDateKey,
        toDateKey,
        activeGoals,
        rows,
    };
}

export async function getGoalDailyViewPayloadByRange(params: {
    studentId: string;
    timeZone?: string | null;
    fromDateKey: string;
    toDateKey: string;
}): Promise<GoalDailyViewPayload> {
    const safeTimeZone = normalizeTimeZone(params.timeZone);
    const today = getTodayDateKey(safeTimeZone);
    const tomorrow = addDaysToDateKey(today, 1);

    const goalsRaw = await fetchGoals({
        studentId: params.studentId,
        fromDateKey: params.fromDateKey,
        toDateKey: params.toDateKey,
    });

    const goals = goalsRaw.map(mapGoal);
    const rows = toRows(goals, params.fromDateKey, params.toDateKey);
    const activeGoals = goals.filter((goal) => goal.dueDateKey >= today);

    return {
        timeZone: safeTimeZone,
        todayKey: today,
        tomorrowKey: tomorrow,
        fromDateKey: params.fromDateKey,
        toDateKey: params.toDateKey,
        activeGoals,
        rows,
    };
}

export async function getStudentActiveGoalCount(studentId: string, timeZone?: string | null): Promise<number> {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const today = getTodayDateKey(safeTimeZone);

    return prisma.studentGoal.count({
        where: {
            studentId,
            deletedAt: null,
            dueDateKey: {
                gte: today,
            },
        },
    });
}

export async function getStudentGoalViews(studentId: string, timeZone?: string | null): Promise<StudentGoalView[]> {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const { fromDateKey, toDateKey } = getDateRangeAroundToday(safeTimeZone, HALF_YEAR_DAYS, HALF_YEAR_DAYS);

    const goals = await fetchGoals({
        studentId,
        fromDateKey,
        toDateKey,
    });

    return goals.map(mapGoal);
}
