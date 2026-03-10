import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    problemFindManyMock,
    requireAdminMock,
    getSessionMock,
    revalidatePathMock,
} = vi.hoisted(() => ({
    problemFindManyMock: vi.fn(),
    requireAdminMock: vi.fn(),
    getSessionMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        problem: {
            findMany: problemFindManyMock,
        },
    },
}));

vi.mock('@/lib/auth', () => ({
    requireAdmin: requireAdminMock,
    getSession: getSessionMock,
}));

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}));

import { getProblemsByCoreProblem } from './actions';

describe('curriculum actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireAdminMock.mockResolvedValue(undefined);
    });

    describe('getProblemsByCoreProblem', () => {
        it('関連CoreProblemとsubjectを含めて問題一覧を取得する', async () => {
            const problems = [
                {
                    id: 'problem-1',
                    question: '問題文',
                    answer: '答え',
                    customId: 'M-1',
                    grade: '中1',
                    masterNumber: 1,
                    videoUrl: 'https://example.com/video',
                    coreProblems: [
                        {
                            id: 'cp-1',
                            name: '方程式',
                            subject: {
                                name: '数学',
                            },
                        },
                    ],
                },
            ];
            problemFindManyMock.mockResolvedValue(problems);

            const result = await getProblemsByCoreProblem('cp-1');

            expect(requireAdminMock).toHaveBeenCalledOnce();
            expect(problemFindManyMock).toHaveBeenCalledWith({
                where: {
                    coreProblems: {
                        some: { id: 'cp-1' },
                    },
                },
                select: {
                    id: true,
                    question: true,
                    answer: true,
                    customId: true,
                    grade: true,
                    masterNumber: true,
                    videoUrl: true,
                    coreProblems: {
                        select: {
                            id: true,
                            name: true,
                            subject: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                        orderBy: [{ order: 'asc' }, { id: 'asc' }],
                    },
                },
                orderBy: [{ order: 'asc' }, { id: 'asc' }],
            });
            expect(result).toEqual({ success: true, problems });
        });

        it('取得に失敗した場合はエラーメッセージを返す', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            problemFindManyMock.mockRejectedValueOnce(new Error('db error'));

            const result = await getProblemsByCoreProblem('cp-1');

            expect(requireAdminMock).toHaveBeenCalledOnce();
            expect(result).toEqual({ success: false, error: '問題の取得に失敗しました' });
            consoleErrorSpy.mockRestore();
        });
    });
});
