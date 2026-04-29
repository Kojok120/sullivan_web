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
                userStates: {
                    where: { userId: 'user-1' },
                    select: { lastAnsweredAt: true, isCleared: true },
                    take: 1,
                },
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

    it('同じ seed なら同点グループの順序を再現する', async () => {
        getReadyCoreProblemIdsMock.mockResolvedValue(new Set(['cp-1']));

        const now = Date.now();
        findManyMock.mockResolvedValue([
            {
                id: 'p-a',
                customId: 'E-1',
                question: 'A',
                order: 1,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-b',
                customId: 'E-2',
                question: 'B',
                order: 2,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-c',
                customId: 'E-3',
                question: 'C',
                order: 3,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
        ]);

        const first = await selectProblemsForPrint('user-1', 'subject-1', undefined, 3, 'seed-a');
        const second = await selectProblemsForPrint('user-1', 'subject-1', undefined, 3, 'seed-a');

        expect(second).toEqual(first);
    });

    it('明示 seed がなくても count の違いで先頭順位は変わらない', async () => {
        getReadyCoreProblemIdsMock.mockResolvedValue(new Set(['cp-1']));

        const now = Date.now();
        findManyMock.mockResolvedValue([
            {
                id: 'p-a',
                customId: 'E-1',
                question: 'A',
                order: 1,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-b',
                customId: 'E-2',
                question: 'B',
                order: 2,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-c',
                customId: 'E-3',
                question: 'C',
                order: 3,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-d',
                customId: 'E-4',
                question: 'D',
                order: 4,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
        ]);

        const full = await selectProblemsForPrint('user-1', 'subject-1', undefined, 4);
        const partial = await selectProblemsForPrint('user-1', 'subject-1', undefined, 2);

        expect(partial).toEqual(full.slice(0, 2));
    });

    it('count 境界に同点がかかってもシャッフル後に切り出す', async () => {
        getReadyCoreProblemIdsMock.mockResolvedValue(new Set(['cp-1']));

        const now = Date.now();
        findManyMock.mockResolvedValue([
            {
                id: 'p-a',
                customId: 'E-1',
                question: 'A',
                order: 1,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-b',
                customId: 'E-2',
                question: 'B',
                order: 2,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
            {
                id: 'p-c',
                customId: 'E-3',
                question: 'C',
                order: 3,
                userStates: [{ lastAnsweredAt: new Date(now - 5 * 24 * 60 * 60 * 1000) }],
            },
        ]);

        const full = await selectProblemsForPrint('user-1', 'subject-1', undefined, 3, 'seed-boundary');
        const partial = await selectProblemsForPrint('user-1', 'subject-1', undefined, 2, 'seed-boundary');

        expect(partial).toEqual(full.slice(0, 2));
    });
});
