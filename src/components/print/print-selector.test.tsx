import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { PrintSelector } from './print-selector';

const { markLectureAsWatchedMock } = vi.hoisted(() => ({
    markLectureAsWatchedMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

vi.mock('@/lib/api/lecture-watched-client', () => ({
    markLectureAsWatched: markLectureAsWatchedMock,
}));

vi.mock('@/components/full-screen-video-player', () => ({
    FullScreenVideoPlayer: ({
        isOpen,
        onClose,
        onVideoEnd,
        playlist,
    }: {
        isOpen: boolean;
        onClose: () => void;
        playlist: Array<{ title: string; url: string }>;
        onVideoEnd?: (video: { title: string; url: string }, index: number) => void;
    }) => (
        isOpen ? (
            <div data-testid="mock-fullscreen-player">
                <button type="button" onClick={onClose}>mock-close-video</button>
                <button type="button" onClick={() => onVideoEnd?.(playlist[0], 0)}>
                    mock-end-video-0
                </button>
                <button type="button" onClick={() => onVideoEnd?.(playlist[1] ?? playlist[0], 1)}>
                    mock-end-video-1
                </button>
            </div>
        ) : null
    ),
}));

describe('印刷セレクター', () => {
    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    };

    const mockFetch = vi.fn();
    const mockPopupClose = vi.fn();
    const mockPopup = {
        location: { href: '' },
        closed: false,
        close: mockPopupClose,
    } as unknown as Window;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useRouter).mockReturnValue(mockRouter);
        vi.stubGlobal('fetch', mockFetch);
        vi.stubGlobal('open', vi.fn(() => mockPopup));
        mockPopup.location.href = '';
        mockPopupClose.mockClear();
        markLectureAsWatchedMock.mockResolvedValue(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('印刷可能な場合は印刷ページへ遷移する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ blocked: false }),
        });

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/print-gate?subjectId=subject-1', {
                method: 'GET',
                cache: 'no-store',
            });
            expect(window.open).toHaveBeenCalledWith('', '_blank');

            const printUrl = new URL(mockPopup.location.href, 'http://localhost');
            expect(printUrl.pathname).toBe('/dashboard/print');
            expect(printUrl.searchParams.get('subjectId')).toBe('subject-1');
            expect(printUrl.searchParams.get('sets')).toBe('1');
            expect(printUrl.searchParams.get('gateChecked')).toBe('1');
            expect(printUrl.searchParams.get('cb')).toBeTruthy();
        });
    });

    it('未視聴講義がある場合はホーム上のモーダルで講義動画導線を表示する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
                lectureVideos: [
                    { title: '導入', url: 'https://example.com/embed/1' },
                    { title: '基本', url: 'https://example.com/embed/2' },
                ],
            }),
        });

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        await waitFor(() => {
            expect(screen.getByText('「主語と動詞」がアンロックされました')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' })).toBeInTheDocument();
            expect(screen.getByTitle('主語と動詞 のプレビュー')).toBeInTheDocument();
            expect(mockPopupClose).toHaveBeenCalledTimes(1);
            expect(mockRouter.push).not.toHaveBeenCalled();
        });
    });

    it('途中で閉じた場合は視聴済みにならずモーダルを維持する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
                lectureVideos: [
                    { title: '導入', url: 'https://example.com/embed/1' },
                ],
            }),
        });

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        await screen.findByText('「主語と動詞」がアンロックされました');

        const previewButton = screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' });
        fireEvent.pointerDown(previewButton);
        fireEvent.click(previewButton);
        expect(screen.getByTestId('mock-fullscreen-player')).toBeInTheDocument();

        fireEvent.click(screen.getByText('mock-close-video'));

        await waitFor(() => {
            expect(screen.queryByTestId('mock-fullscreen-player')).not.toBeInTheDocument();
            expect(screen.getByText('「主語と動詞」がアンロックされました')).toBeInTheDocument();
            expect(markLectureAsWatchedMock).not.toHaveBeenCalled();
        });
    });

    it('最後まで視聴後は同じ設定のまま再度印刷できる', async () => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    blocked: true,
                    coreProblemId: 'cp-1',
                    coreProblemName: '主語と動詞',
                    lectureVideos: [
                        { title: '導入', url: 'https://example.com/embed/1' },
                        { title: '基本', url: 'https://example.com/embed/2' },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blocked: false }),
            });

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByText('English'));
        expect(screen.getByText('20問 / 2セット')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
        await screen.findByText('「主語と動詞」がアンロックされました');

        const previewButton = screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' });
        fireEvent.pointerDown(previewButton);
        fireEvent.click(previewButton);
        fireEvent.click(screen.getByText('mock-end-video-0'));
        expect(markLectureAsWatchedMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('mock-end-video-0'));
        expect(markLectureAsWatchedMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('mock-end-video-1'));

        await waitFor(() => {
            expect(markLectureAsWatchedMock).toHaveBeenCalledWith({ coreProblemId: 'cp-1' });
            expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
            expect(screen.queryByText('「主語と動詞」がアンロックされました')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        await waitFor(() => {
            const printUrl = new URL(mockPopup.location.href, 'http://localhost');
            expect(printUrl.pathname).toBe('/dashboard/print');
            expect(printUrl.searchParams.get('subjectId')).toBe('subject-1');
            expect(printUrl.searchParams.get('sets')).toBe('2');
            expect(printUrl.searchParams.get('gateChecked')).toBe('1');
        });
    });

    it('印刷ゲート判定APIが失敗した場合は印刷ページへ遷移しない', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
        });

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        await waitFor(() => {
            expect(mockRouter.push).not.toHaveBeenCalled();
            expect(mockPopupClose).toHaveBeenCalledTimes(1);
            expect(mockPopup.location.href).toBe('');
        });
    });

    it('科目選択後のモーダル外をタップするとモーダルが閉じる', async () => {
        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        expect(screen.getByRole('button', { name: '印刷する' })).toBeInTheDocument();

        fireEvent.pointerDown(document.body);

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: '印刷する' })).not.toBeInTheDocument();
        });
    });

    it('同じ科目を再タップするとセット数が増える', async () => {
        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        expect(screen.getByText('10問 / 1セット')).toBeInTheDocument();

        fireEvent.click(screen.getByText('English'));

        await waitFor(() => {
            expect(screen.getByText('20問 / 2セット')).toBeInTheDocument();
        });
    });
});
