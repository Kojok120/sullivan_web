export type GoalType = 'PROBLEM_COUNT' | 'CUSTOM';
export type DraftGranularity = 'HALF' | 'WEEKLY' | 'DAILY';

export type GoalMilestoneInput = {
    dateKey: string;
    targetCount?: number | null;
    targetText?: string | null;
};

export type TeacherGoalInput = {
    id?: string;
    type: GoalType;
    name: string;
    subjectId?: string | null;
    dueDateKey: string;
    milestones: GoalMilestoneInput[];
};

export type GoalDraftProposal = {
    dateKey: string;
    targetCount?: number | null;
    targetText?: string | null;
};

export type StudentGoalMilestoneView = {
    id: string;
    dateKey: string;
    targetCount: number | null;
    targetText: string | null;
};

export type StudentGoalView = {
    id: string;
    type: GoalType;
    name: string;
    dueDateKey: string;
    subjectId: string | null;
    subjectName: string | null;
    milestones: StudentGoalMilestoneView[];
};

export type DailyGoalEntry = {
    goalId: string;
    goalType: GoalType;
    goalName: string;
    subjectName: string | null;
    dueDateKey: string;
    targetCount: number | null;
    targetText: string | null;
};

export type DailyGoalRow = {
    dateKey: string;
    entries: DailyGoalEntry[];
};

export type GoalDailyViewPayload = {
    timeZone: string;
    todayKey: string;
    tomorrowKey: string;
    fromDateKey: string;
    toDateKey: string;
    activeGoals: StudentGoalView[];
    rows: DailyGoalRow[];
};
