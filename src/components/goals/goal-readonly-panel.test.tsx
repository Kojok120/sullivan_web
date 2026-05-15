import { act, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalReadonlyPanel } from '@/components/goals/goal-readonly-panel';
import type { GoalDailyViewPayload } from '@/lib/types/student-goal';
import jaMessages from '@/messages/ja.json';

const { getGoalDailyViewActionMock, getBrowserTimeZoneSafeMock } = vi.hoisted(() => ({
    getGoalDailyViewActionMock: vi.fn(),
    getBrowserTimeZoneSafeMock: vi.fn(),
}));

vi.mock('@/app/actions/student-goals', () => ({
    getGoalDailyViewAction: getGoalDailyViewActionMock,
}));

vi.mock('@/lib/date-key', async () => {
    const actual = await vi.importActual<typeof import('@/lib/date-key')>('@/lib/date-key');
    return {
        ...actual,
        getBrowserTimeZoneSafe: getBrowserTimeZoneSafeMock,
    };
});

function createPayload(params?: Partial<GoalDailyViewPayload>): GoalDailyViewPayload {
    return {
        timeZone: 'Asia/Tokyo',
        todayKey: '2026-04-11',
        tomorrowKey: '2026-04-12',
        fromDateKey: '2026-04-11',
        toDateKey: '2026-04-12',
        activeGoals: [
            {
                id: 'goal-1',
                type: 'PROBLEM_COUNT',
                name: '数学の問題数',
                dueDateKey: '2026-04-12',
                subjectId: 'subject-math',
                subjectName: '数学',
                milestones: [
                    {
                        id: 'milestone-1',
                        dateKey: '2026-04-11',
                        targetCount: 3,
                        targetText: null,
                    },
                    {
                        id: 'milestone-2',
                        dateKey: '2026-04-12',
                        targetCount: 5,
                        targetText: null,
                    },
                ],
            },
        ],
        rows: [
            {
                dateKey: '2026-04-11',
                entries: [
                    {
                        goalId: 'goal-1',
                        goalType: 'PROBLEM_COUNT',
                        goalName: '数学の問題数',
                        subjectName: '数学',
                        dueDateKey: '2026-04-12',
                        targetCount: 3,
                        targetText: null,
                    },
                ],
            },
            {
                dateKey: '2026-04-12',
                entries: [
                    {
                        goalId: 'goal-1',
                        goalType: 'PROBLEM_COUNT',
                        goalName: '数学の問題数',
                        subjectName: '数学',
                        dueDateKey: '2026-04-12',
                        targetCount: 5,
                        targetText: null,
                    },
                ],
            },
        ],
        ...params,
    };
}

function renderGoalReadonlyPanel(props: {
    studentId: string;
    initialData: GoalDailyViewPayload;
    showTomorrow?: boolean;
    showTimeline?: boolean;
}) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            <GoalReadonlyPanel {...props} />
        </NextIntlClientProvider>
    );
}

describe('GoalReadonlyPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getBrowserTimeZoneSafeMock.mockReturnValue('Asia/Tokyo');
        getGoalDailyViewActionMock.mockResolvedValue({
            success: true,
            data: createPayload({ timeZone: 'America/Los_Angeles' }),
        });
    });

    it('initialData と同じ timezone のときは再取得しない', async () => {
        renderGoalReadonlyPanel({
            studentId: 'student-1',
            initialData: createPayload(),
            showTomorrow: true,
        });

        await act(async () => {});

        expect(getGoalDailyViewActionMock).not.toHaveBeenCalled();
        expect(screen.getAllByText('数学').length).toBeGreaterThan(0);
    });

    it('timezone が異なるときは現在の表示範囲で再取得する', async () => {
        getBrowserTimeZoneSafeMock.mockReturnValue('America/Los_Angeles');

        renderGoalReadonlyPanel({
            studentId: 'student-1',
            initialData: createPayload(),
            showTomorrow: true,
        });

        await waitFor(() => {
            expect(getGoalDailyViewActionMock).toHaveBeenCalledWith({
                studentId: 'student-1',
                timeZone: 'America/Los_Angeles',
                fromDateKey: '2026-04-11',
                toDateKey: '2026-04-12',
            });
        });
    });

    it('initialData が更新されたときは表示内容を追従する', async () => {
        const { rerender } = renderGoalReadonlyPanel({
            studentId: 'student-1',
            initialData: createPayload(),
            showTomorrow: true,
        });

        rerender(
            <NextIntlClientProvider locale="ja" messages={jaMessages}>
                <GoalReadonlyPanel
                    studentId="student-1"
                    initialData={createPayload({
                        activeGoals: [
                            {
                                id: 'goal-2',
                                type: 'CUSTOM',
                                name: '英語の復習',
                                dueDateKey: '2026-04-12',
                                subjectId: 'subject-english',
                                subjectName: '英語',
                                milestones: [
                                    {
                                        id: 'milestone-3',
                                        dateKey: '2026-04-11',
                                        targetCount: null,
                                        targetText: '単語を20個覚える',
                                    },
                                ],
                            },
                        ],
                        rows: [
                            {
                                dateKey: '2026-04-11',
                                entries: [
                                    {
                                        goalId: 'goal-2',
                                        goalType: 'CUSTOM',
                                        goalName: '英語の復習',
                                        subjectName: '英語',
                                        dueDateKey: '2026-04-12',
                                        targetCount: null,
                                        targetText: '単語を20個覚える',
                                    },
                                ],
                            },
                            {
                                dateKey: '2026-04-12',
                                entries: [],
                            },
                        ],
                    })}
                    showTomorrow
                />
            </NextIntlClientProvider>,
        );

        await waitFor(() => {
            expect(screen.getByText('英語の復習')).toBeInTheDocument();
        });
    });
});
