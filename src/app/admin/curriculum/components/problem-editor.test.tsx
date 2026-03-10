import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemEditor } from './problem-editor';

const { getProblemsByCoreProblemMock } = vi.hoisted(() => ({
    getProblemsByCoreProblemMock: vi.fn(),
}));

vi.mock('../actions', () => ({
    getProblemsByCoreProblem: getProblemsByCoreProblemMock,
}));

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

describe('ProblemEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('追加メタ情報と未設定値プレースホルダを表示する', async () => {
        getProblemsByCoreProblemMock.mockResolvedValue({
            success: true,
            problems: [
                {
                    id: 'problem-1',
                    question: '一次方程式を解け',
                    answer: 'x=3',
                    customId: 'E-1',
                    grade: '中1',
                    masterNumber: 101,
                    videoUrl: 'https://example.com/videos/101',
                    coreProblems: [
                        {
                            id: 'cp-1',
                            name: '一次方程式',
                            subject: {
                                name: '数学',
                            },
                        },
                        {
                            id: 'cp-2',
                            name: '文章題',
                            subject: {
                                name: '数学',
                            },
                        },
                    ],
                },
                {
                    id: 'problem-2',
                    question: '未設定の問題',
                    answer: null,
                    customId: null,
                    grade: null,
                    masterNumber: null,
                    videoUrl: null,
                    coreProblems: [],
                },
            ],
        });

        render(<ProblemEditor coreProblemId="cp-1" />);

        await waitFor(() => {
            expect(getProblemsByCoreProblemMock).toHaveBeenCalledWith('cp-1');
        });

        expect(await screen.findByText('問題一覧 (2)')).toBeInTheDocument();
        expect(screen.getByText('一次方程式を解け')).toBeInTheDocument();
        expect(screen.getByText('101')).toBeInTheDocument();
        expect(screen.getByText('E-1')).toBeInTheDocument();
        expect(screen.getByText('数学 > 一次方程式')).toBeInTheDocument();
        expect(screen.getByText('数学 > 文章題')).toBeInTheDocument();

        const videoLink = screen.getByRole('link', { name: 'https://example.com/videos/101' });
        expect(videoLink).toHaveAttribute('href', 'https://example.com/videos/101');

        expect(screen.getByText('未設定の問題')).toBeInTheDocument();
        expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(5);
    });

    it('http/https 以外の動画URLはリンク化しない', async () => {
        getProblemsByCoreProblemMock.mockResolvedValue({
            success: true,
            problems: [
                {
                    id: 'problem-unsafe',
                    question: '危険なURLの問題',
                    answer: 'x=1',
                    customId: 'E-2',
                    grade: '中1',
                    masterNumber: 102,
                    videoUrl: 'javascript:alert(1)',
                    coreProblems: [],
                },
            ],
        });

        render(<ProblemEditor coreProblemId="cp-unsafe" />);

        await waitFor(() => {
            expect(getProblemsByCoreProblemMock).toHaveBeenCalledWith('cp-unsafe');
        });

        expect(await screen.findByText('危険なURLの問題')).toBeInTheDocument();
        expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull();
    });

    it('coreProblemId 切り替え後に古いリクエスト結果で上書きしない', async () => {
        const firstRequest = createDeferred<{
            success: boolean;
            problems?: Array<{
                id: string;
                question: string;
                answer: string | null;
                customId: string | null;
                grade: string | null;
                masterNumber: number | null;
                videoUrl: string | null;
                coreProblems: Array<{ id: string; name: string; subject: { name: string } }>;
            }>;
        }>();
        const secondRequest = createDeferred<{
            success: boolean;
            problems?: Array<{
                id: string;
                question: string;
                answer: string | null;
                customId: string | null;
                grade: string | null;
                masterNumber: number | null;
                videoUrl: string | null;
                coreProblems: Array<{ id: string; name: string; subject: { name: string } }>;
            }>;
        }>();

        getProblemsByCoreProblemMock.mockImplementation((coreProblemId: string) => {
            if (coreProblemId === 'cp-1') {
                return firstRequest.promise;
            }

            return secondRequest.promise;
        });

        const { rerender } = render(<ProblemEditor coreProblemId="cp-1" />);

        await waitFor(() => {
            expect(getProblemsByCoreProblemMock).toHaveBeenCalledWith('cp-1');
        });

        rerender(<ProblemEditor coreProblemId="cp-2" />);

        await waitFor(() => {
            expect(getProblemsByCoreProblemMock).toHaveBeenCalledWith('cp-2');
        });

        await act(async () => {
            secondRequest.resolve({
                success: true,
                problems: [
                    {
                        id: 'problem-new',
                        question: '新しい問題',
                        answer: 'x=4',
                        customId: 'NEW-1',
                        grade: '中2',
                        masterNumber: 201,
                        videoUrl: null,
                        coreProblems: [],
                    },
                ],
            });
            await secondRequest.promise;
        });

        expect(await screen.findByText('新しい問題')).toBeInTheDocument();

        await act(async () => {
            firstRequest.resolve({
                success: true,
                problems: [
                    {
                        id: 'problem-old',
                        question: '古い問題',
                        answer: 'x=1',
                        customId: 'OLD-1',
                        grade: '中1',
                        masterNumber: 101,
                        videoUrl: null,
                        coreProblems: [],
                    },
                ],
            });
            await firstRequest.promise;
        });

        expect(screen.getByText('新しい問題')).toBeInTheDocument();
        expect(screen.queryByText('古い問題')).toBeNull();
    });

    it('取得失敗時は前回の問題一覧をクリアする', async () => {
        getProblemsByCoreProblemMock
            .mockResolvedValueOnce({
                success: true,
                problems: [
                    {
                        id: 'problem-1',
                        question: '表示中の問題',
                        answer: 'x=3',
                        customId: 'E-1',
                        grade: '中1',
                        masterNumber: 101,
                        videoUrl: null,
                        coreProblems: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                success: false,
                error: '取得に失敗しました',
            });

        const { rerender } = render(<ProblemEditor coreProblemId="cp-1" />);

        expect(await screen.findByText('表示中の問題')).toBeInTheDocument();

        rerender(<ProblemEditor coreProblemId="cp-2" />);

        expect(await screen.findByText('取得に失敗しました')).toBeInTheDocument();
        expect(screen.queryByText('表示中の問題')).toBeNull();
    });

    it('coreProblemId 切り替え中は前回の問題一覧ではなくローディングを表示する', async () => {
        const firstRequest = createDeferred<{
            success: boolean;
            problems?: Array<{
                id: string;
                question: string;
                answer: string | null;
                customId: string | null;
                grade: string | null;
                masterNumber: number | null;
                videoUrl: string | null;
                coreProblems: Array<{ id: string; name: string; subject: { name: string } }>;
            }>;
        }>();
        const secondRequest = createDeferred<{
            success: boolean;
            problems?: Array<{
                id: string;
                question: string;
                answer: string | null;
                customId: string | null;
                grade: string | null;
                masterNumber: number | null;
                videoUrl: string | null;
                coreProblems: Array<{ id: string; name: string; subject: { name: string } }>;
            }>;
        }>();

        getProblemsByCoreProblemMock.mockImplementation((coreProblemId: string) => {
            if (coreProblemId === 'cp-1') {
                return firstRequest.promise;
            }

            return secondRequest.promise;
        });

        const { rerender } = render(<ProblemEditor coreProblemId="cp-1" />);

        await act(async () => {
            firstRequest.resolve({
                success: true,
                problems: [
                    {
                        id: 'problem-1',
                        question: '表示中の問題',
                        answer: 'x=3',
                        customId: 'E-1',
                        grade: '中1',
                        masterNumber: 101,
                        videoUrl: null,
                        coreProblems: [],
                    },
                ],
            });
            await firstRequest.promise;
        });

        expect(await screen.findByText('表示中の問題')).toBeInTheDocument();

        rerender(<ProblemEditor coreProblemId="cp-2" />);

        expect(screen.getByText('読み込み中...')).toBeInTheDocument();
        expect(screen.queryByText('表示中の問題')).toBeNull();

        await act(async () => {
            secondRequest.resolve({
                success: true,
                problems: [],
            });
            await secondRequest.promise;
        });

        expect(await screen.findByText('問題がありません。')).toBeInTheDocument();
    });
});
