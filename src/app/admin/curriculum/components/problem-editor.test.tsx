import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemEditor } from './problem-editor';

const { getProblemsByCoreProblemMock } = vi.hoisted(() => ({
    getProblemsByCoreProblemMock: vi.fn(),
}));

vi.mock('../actions', () => ({
    getProblemsByCoreProblem: getProblemsByCoreProblemMock,
}));

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
                                id: 'subject-1',
                                name: '数学',
                            },
                        },
                        {
                            id: 'cp-2',
                            name: '文章題',
                            subject: {
                                id: 'subject-1',
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
});
