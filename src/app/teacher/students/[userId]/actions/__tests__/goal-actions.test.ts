import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
    getSession: vi.fn(),
    isTeacherOrAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        studentGoal: {
            count: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        },
        studentGoalMilestone: {
            deleteMany: vi.fn(),
            upsert: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('../teacher-access', () => ({
    ensureTeacherCanAccessStudent: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import {
    generateStudentGoalDraftActionImpl,
    saveStudentGoalsActionImpl,
    updateStudentGoalDayActionImpl,
} from '../goal-actions';
import { ensureTeacherCanAccessStudent } from '../teacher-access';

const mockedGetSession = vi.mocked(getSession);
const mockedIsTeacherOrAdmin = vi.mocked(isTeacherOrAdmin);
const mockedEnsureTeacherCanAccessStudent = vi.mocked(ensureTeacherCanAccessStudent);
const mockedPrisma = prisma as unknown as {
    studentGoal: {
        count: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
};

describe('goal actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-05T00:00:00Z'));
        mockedGetSession.mockResolvedValue({ userId: 't1', role: 'TEACHER' } as never);
        mockedIsTeacherOrAdmin.mockReturnValue(true);
        mockedEnsureTeacherCanAccessStudent.mockResolvedValue(null);
        mockedPrisma.studentGoal.count.mockResolvedValue(0);
        mockedPrisma.studentGoal.findMany.mockResolvedValue([]);
    });

    it('saveStudentGoalsAction: 任意目標名重複を拒否する', async () => {
        const result = await saveStudentGoalsActionImpl('s1', {
            timeZone: 'Asia/Tokyo',
            goals: [
                {
                    type: 'CUSTOM',
                    name: '語彙',
                    dueDateKey: '2026-03-10',
                    subjectId: null,
                    milestones: [],
                },
                {
                    type: 'CUSTOM',
                    name: ' 語彙 ',
                    dueDateKey: '2026-03-10',
                    subjectId: null,
                    milestones: [],
                },
            ],
        });

        expect(result).toEqual({ error: '任意目標名が重複しています' });
    });

    it('saveStudentGoalsAction: 不正な期限日付を拒否する', async () => {
        const result = await saveStudentGoalsActionImpl('s1', {
            timeZone: 'Asia/Tokyo',
            goals: [
                {
                    type: 'CUSTOM',
                    name: '語彙',
                    dueDateKey: '2026-02-30',
                    subjectId: null,
                    milestones: [],
                },
            ],
        });

        expect(result).toEqual({ error: '期限日付の形式が不正です' });
    });

    it('updateStudentGoalDayAction: 空値でmilestoneを削除する', async () => {
        const deleteMany = vi.fn().mockResolvedValue(undefined);
        const upsert = vi.fn().mockResolvedValue(undefined);
        mockedPrisma.studentGoal.findMany.mockResolvedValue([{ id: 'g1' }]);
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
            await cb({
                studentGoalMilestone: {
                    deleteMany,
                    upsert,
                },
            });
        });

        const result = await updateStudentGoalDayActionImpl('s1', {
            dateKey: '2026-03-06',
            entries: [{ goalId: 'g1', targetCount: null, targetText: '   ' }],
        });

        expect(result).toEqual({ success: true });
        expect(deleteMany).toHaveBeenCalledTimes(1);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('generateStudentGoalDraftAction: Gemini未使用時にfallbackを返す', async () => {
        const previousKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = '';

        const result = await generateStudentGoalDraftActionImpl('s1', {
            timeZone: 'Asia/Tokyo',
            granularity: 'WEEKLY',
            goal: {
                type: 'PROBLEM_COUNT',
                name: '数学の問題数',
                subjectName: '数学',
                dueDateKey: '2026-03-20',
                targetCount: 14,
                milestones: [],
            },
        });

        process.env.GEMINI_API_KEY = previousKey;

        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result.success).toBe(true);
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]).toMatchObject({ dateKey: '2026-03-05' });
    });
});
