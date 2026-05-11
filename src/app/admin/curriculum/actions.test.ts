import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    problemFindManyMock,
    requireProblemAuthorMock,
    getSessionMock,
    revalidatePathMock,
} = vi.hoisted(() => ({
    problemFindManyMock: vi.fn(),
    requireProblemAuthorMock: vi.fn(),
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
    requireProblemAuthor: requireProblemAuthorMock,
    getSession: getSessionMock,
}));

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}));

import { getProblemsByCoreProblem } from './actions';

describe('curriculum actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireProblemAuthorMock.mockResolvedValue(undefined);
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

            expect(requireProblemAuthorMock).toHaveBeenCalledOnce();
            expect(problemFindManyMock).toHaveBeenCalledWith({
                where: {
                    coreProblems: {
                        some: { id: 'cp-1' },
                    },
                },
                select: {
                    id: true,
                    answer: true,
                    customId: true,
                    grade: true,
                    masterNumber: true,
                    videoUrl: true,
                    publishedRevision: {
                        select: {
                            structuredContent: true,
                            correctAnswer: true,
                        },
                    },
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
            try {
                problemFindManyMock.mockRejectedValueOnce(new Error('db error'));

                const result = await getProblemsByCoreProblem('cp-1');

                expect(requireProblemAuthorMock).toHaveBeenCalledOnce();
                expect(result).toEqual({ success: false, error: '問題の取得に失敗しました' });
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });
    });
});
