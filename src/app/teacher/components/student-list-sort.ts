import type { StudentStats } from '@/lib/analytics';

export type StudentSortKey = 'loginId' | 'totalProblemsSolved' | 'currentStreak' | 'lastActivity';
export type StudentSortOrder = 'asc' | 'desc';

export type SortableStudent = {
    id: string;
    loginId: string;
    stats: Pick<StudentStats, 'totalProblemsSolved' | 'currentStreak' | 'lastActivity'>;
};

export const DEFAULT_STUDENT_SORT_ORDER: Record<StudentSortKey, StudentSortOrder> = {
    loginId: 'asc',
    totalProblemsSolved: 'desc',
    currentStreak: 'desc',
    lastActivity: 'desc',
};

export const STUDENT_SORT_OPTIONS: Array<{ value: StudentSortKey; label: string }> = [
    { value: 'loginId', label: '生徒ID' },
    { value: 'totalProblemsSolved', label: '総回答数' },
    { value: 'currentStreak', label: '連続学習' },
    { value: 'lastActivity', label: '最終学習日' },
];

const loginIdCollator = new Intl.Collator('ja', {
    numeric: true,
    sensitivity: 'base',
});

function compareLoginId(a: string, b: string) {
    return loginIdCollator.compare(a, b);
}

function compareNullableDate(a: Date | null, b: Date | null, sortOrder: StudentSortOrder) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    return sortOrder === 'asc'
        ? a.getTime() - b.getTime()
        : b.getTime() - a.getTime();
}

export function sortStudents<T extends SortableStudent>(
    students: T[],
    sortBy: StudentSortKey,
    sortOrder: StudentSortOrder,
) {
    return [...students].sort((a, b) => {
        const result = sortBy === 'loginId'
            ? compareLoginId(a.loginId, b.loginId) * (sortOrder === 'asc' ? 1 : -1)
            : sortBy === 'totalProblemsSolved'
                ? (a.stats.totalProblemsSolved - b.stats.totalProblemsSolved) * (sortOrder === 'asc' ? 1 : -1)
                : sortBy === 'currentStreak'
                    ? (a.stats.currentStreak - b.stats.currentStreak) * (sortOrder === 'asc' ? 1 : -1)
                    : compareNullableDate(a.stats.lastActivity, b.stats.lastActivity, sortOrder);

        if (result !== 0) return result;

        const loginIdResult = compareLoginId(a.loginId, b.loginId);
        if (loginIdResult !== 0) return loginIdResult;

        return a.id.localeCompare(b.id);
    });
}
