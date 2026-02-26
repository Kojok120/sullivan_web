import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGoalDailyViewPayloadByRange } from '@/lib/student-goal-service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        studentGoal: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

describe('student-goal-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-05T00:00:00Z'));
    });

    it('マイルストーン未設定日は直前値を引き継ぐ', async () => {
        vi.mocked(prisma.studentGoal.findMany).mockResolvedValue([
            {
                id: 'goal-1',
                type: 'PROBLEM_COUNT',
                name: '英語の問題数',
                dueDateKey: '2026-03-10',
                subjectId: 'subject-1',
                subject: { id: 'subject-1', name: '英語' },
                milestones: [
                    {
                        id: 'm-1',
                        dateKey: '2026-03-01',
                        targetCount: 3,
                        targetText: null,
                    },
                    {
                        id: 'm-2',
                        dateKey: '2026-03-04',
                        targetCount: 5,
                        targetText: null,
                    },
                ],
                createdAt: new Date('2026-03-01T00:00:00Z'),
                updatedAt: new Date('2026-03-01T00:00:00Z'),
                deletedAt: null,
                studentId: 'student-1',
                createdByTeacherId: 'teacher-1',
                updatedByTeacherId: 'teacher-1',
            },
        ] as never);

        const payload = await getGoalDailyViewPayloadByRange({
            studentId: 'student-1',
            timeZone: 'Asia/Tokyo',
            fromDateKey: '2026-03-01',
            toDateKey: '2026-03-06',
        });

        expect(payload.rows).toHaveLength(6);
        expect(payload.rows[0].entries[0]?.targetCount).toBe(3); // 3/1
        expect(payload.rows[1].entries[0]?.targetCount).toBe(3); // 3/2
        expect(payload.rows[2].entries[0]?.targetCount).toBe(3); // 3/3
        expect(payload.rows[3].entries[0]?.targetCount).toBe(5); // 3/4
        expect(payload.rows[4].entries[0]?.targetCount).toBe(5); // 3/5
    });

    it('最初のマイルストーンより前の日付は未設定になる', async () => {
        vi.mocked(prisma.studentGoal.findMany).mockResolvedValue([
            {
                id: 'goal-1',
                type: 'CUSTOM',
                name: '暗記',
                dueDateKey: '2026-03-10',
                subjectId: null,
                subject: null,
                milestones: [
                    {
                        id: 'm-1',
                        dateKey: '2026-03-03',
                        targetCount: null,
                        targetText: '単語20個',
                    },
                ],
                createdAt: new Date('2026-03-01T00:00:00Z'),
                updatedAt: new Date('2026-03-01T00:00:00Z'),
                deletedAt: null,
                studentId: 'student-1',
                createdByTeacherId: 'teacher-1',
                updatedByTeacherId: 'teacher-1',
            },
        ] as never);

        const payload = await getGoalDailyViewPayloadByRange({
            studentId: 'student-1',
            timeZone: 'Asia/Tokyo',
            fromDateKey: '2026-03-01',
            toDateKey: '2026-03-04',
        });

        expect(payload.rows[0].entries).toHaveLength(0);
        expect(payload.rows[1].entries).toHaveLength(0);
        expect(payload.rows[2].entries[0]?.targetText).toBe('単語20個');
    });

    it('activeGoalsは今日以降が期限の目標だけを返す', async () => {
        vi.mocked(prisma.studentGoal.findMany).mockResolvedValue([
            {
                id: 'goal-old',
                type: 'CUSTOM',
                name: '過去目標',
                dueDateKey: '2026-03-04',
                subjectId: null,
                subject: null,
                milestones: [
                    {
                        id: 'm-old',
                        dateKey: '2026-03-01',
                        targetCount: null,
                        targetText: '旧',
                    },
                ],
                createdAt: new Date('2026-03-01T00:00:00Z'),
                updatedAt: new Date('2026-03-01T00:00:00Z'),
                deletedAt: null,
                studentId: 'student-1',
                createdByTeacherId: 'teacher-1',
                updatedByTeacherId: 'teacher-1',
            },
            {
                id: 'goal-active',
                type: 'CUSTOM',
                name: '有効目標',
                dueDateKey: '2026-03-08',
                subjectId: null,
                subject: null,
                milestones: [
                    {
                        id: 'm-active',
                        dateKey: '2026-03-05',
                        targetCount: null,
                        targetText: '新',
                    },
                ],
                createdAt: new Date('2026-03-05T00:00:00Z'),
                updatedAt: new Date('2026-03-05T00:00:00Z'),
                deletedAt: null,
                studentId: 'student-1',
                createdByTeacherId: 'teacher-1',
                updatedByTeacherId: 'teacher-1',
            },
        ] as never);

        const payload = await getGoalDailyViewPayloadByRange({
            studentId: 'student-1',
            timeZone: 'Asia/Tokyo',
            fromDateKey: '2026-03-01',
            toDateKey: '2026-03-10',
        });

        expect(payload.todayKey).toBe('2026-03-05');
        expect(payload.activeGoals.map((goal) => goal.id)).toEqual(['goal-active']);
    });
});
