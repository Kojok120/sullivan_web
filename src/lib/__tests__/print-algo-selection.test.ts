import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock, getReadyCoreProblemIdsMock } = vi.hoisted(() => ({
    findManyMock: vi.fn(),
    getReadyCoreProblemIdsMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        problem: {
            findMany: findManyMock,
        },
    },
}));

vi.mock('@/lib/progression', () => ({
    getReadyCoreProblemIds: getReadyCoreProblemIdsMock,
}));

import { selectProblemsForPrint } from '@/lib/print-algo';

describe('selectProblemsForPrint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('通常印刷では ready CoreProblem を条件にし、軽量selectで取得する', async () => {
        getReadyCoreProblemIdsMock.mockResolvedValue(new Set(['cp-1', 'cp-2']));
        findManyMock.mockResolvedValue([]);

        await selectProblemsForPrint('user-1', 'subject-1', undefined, 10);

        expect(getReadyCoreProblemIdsMock).toHaveBeenCalledWith('user-1', 'subject-1');
        expect(findManyMock).toHaveBeenCalledTimes(1);

        const query = findManyMock.mock.calls[0]?.[0];
        expect(query.where).toEqual({
            subjectId: 'subject-1',
            coreProblems: {
                every: {
                    id: { in: ['cp-1', 'cp-2'] },
                },
            },
        });
        expect(query).toMatchObject({
            select: {
                id: true,
                customId: true,
                question: true,
                order: true,
            },
        });
        expect(query.include).toBeUndefined();
    });

    it('coreProblemId 指定時は ready CoreProblem 取得をスキップする', async () => {
        findManyMock.mockResolvedValue([]);

        await selectProblemsForPrint('user-1', 'subject-1', 'cp-9', 10);

        expect(getReadyCoreProblemIdsMock).not.toHaveBeenCalled();
        expect(findManyMock).toHaveBeenCalledTimes(1);

        const query = findManyMock.mock.calls[0]?.[0];
        expect(query.where).toEqual({
            subjectId: 'subject-1',
            coreProblems: {
                some: {
                    id: 'cp-9',
                },
            },
        });
    });

    it('既存のスコア順序を維持して返却する', async () => {
        getReadyCoreProblemIdsMock.mockResolvedValue(new Set(['cp-1']));

        const now = Date.now();
        findManyMock.mockResolvedValue([
            {
                id: 'p-old',
                customId: 'E-1',
                question: 'old',
                order: 1,
                coreProblems: [{ userStates: [{ priority: 0 }] }],
                userStates: [{ lastAnsweredAt: new Date(now - 20 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-new',
                customId: 'E-2',
                question: 'new',
                order: 2,
                coreProblems: [{ userStates: [{ priority: 0 }] }],
                userStates: [],
            },
        ]);

        const result = await selectProblemsForPrint('user-1', 'subject-1', undefined, 2);

        expect(result).toEqual([
            { id: 'p-old', customId: 'E-1', question: 'old', order: 1 },
            { id: 'p-new', customId: 'E-2', question: 'new', order: 2 },
        ]);
    });
});
