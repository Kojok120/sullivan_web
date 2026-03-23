import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { PrintSelector } from './print-selector';
import { getPreferredPrintView } from '@/lib/print-view';

const { markLectureAsWatchedMock } = vi.hoisted(() => ({
    markLectureAsWatchedMock: vi.fn(),
}));

const YOUTUBE_URL_1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YOUTUBE_URL_2 = 'https://www.youtube.com/watch?v=9bZkp7q19f0';
const UNSUPPORTED_URL = 'https://example.com/embed/1';

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

vi.mock('@/lib/api/lecture-watched-client', () => ({
    markLectureAsWatched: markLectureAsWatchedMock,
}));

vi.mock('@/lib/print-view', () => ({
    getPreferredPrintView: vi.fn(() => 'pdf'),
}));

vi.mock('@/components/full-screen-video-player', () => ({
    FullScreenVideoPlayer: ({
        isOpen,
        onClose,
        onVideoEnd,
        playlist,
        requiresTrackedCompletion,
    }: {
        isOpen: boolean;
        onClose: () => void;
        playlist: Array<{ title: string; url: string }>;
        onVideoEnd?: (video: { title: string; url: string }, index: number, watchedDurationSeconds?: number, videoDurationSeconds?: number) => void;
        requiresTrackedCompletion?: boolean;
    }) => (
        isOpen ? (
            <div data-testid="mock-fullscreen-player">
                <span data-testid="mock-requires-tracked-completion">{String(requiresTrackedCompletion)}</span>
                <button type="button" onClick={onClose}>mock-close-video</button>
                <button type="button" onClick={() => onVideoEnd?.(playlist[0], 0, 120, 120)}>
                    mock-end-video-0
                </button>
                <button type="button" onClick={() => onVideoEnd?.(playlist[1] ?? playlist[0], 1, 240, 240)}>
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

    const createDeferred = <T,>() => {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        return { promise, resolve, reject };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useRouter).mockReturnValue(mockRouter);
        vi.mocked(getPreferredPrintView).mockReturnValue('pdf');
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
            expect(printUrl.searchParams.get('view')).toBe('pdf');
            expect(printUrl.searchParams.get('cb')).toBeTruthy();
        });
    });

    it('iPhone/iPad では印刷アシスト画面へ遷移する', async () => {
        vi.mocked(getPreferredPrintView).mockReturnValue('assist');
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
            expect(window.open).toHaveBeenCalledWith('', '_blank');

            const printUrl = new URL(mockPopup.location.href, 'http://localhost');
            expect(printUrl.pathname).toBe('/dashboard/print');
            expect(printUrl.searchParams.get('subjectId')).toBe('subject-1');
            expect(printUrl.searchParams.get('sets')).toBe('1');
            expect(printUrl.searchParams.get('gateChecked')).toBe('1');
            expect(printUrl.searchParams.get('view')).toBe('assist');
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
                    { title: '導入', url: YOUTUBE_URL_1 },
                    { title: '基本', url: YOUTUBE_URL_2 },
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
            const previewButton = screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' });
            expect(previewButton).toBeInTheDocument();
            expect(previewButton).toBeEnabled();
            expect(screen.getByTitle('主語と動詞 のプレビュー')).toBeInTheDocument();
            expect(mockPopupClose).toHaveBeenCalledTimes(1);
            expect(mockRouter.push).not.toHaveBeenCalled();
        });
    });

    it('印刷ゲート動画が YouTube 以外の場合は再生を無効化して案内する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
                lectureVideos: [
                    { title: '導入', url: UNSUPPORTED_URL },
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
        expect(previewButton).toBeDisabled();
        expect(screen.getAllByText('講義動画の URL が YouTube ではないため、視聴完了を自動判定できません。管理者に設定をご確認ください。').length).toBeGreaterThan(0);

        fireEvent.click(previewButton);

        expect(screen.queryByTestId('mock-fullscreen-player')).not.toBeInTheDocument();
    });

    it('途中で閉じた場合は視聴済みにならずモーダルを維持する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
                lectureVideos: [
                    { title: '導入', url: YOUTUBE_URL_1 },
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
                        { title: '導入', url: YOUTUBE_URL_1 },
                        { title: '基本', url: YOUTUBE_URL_2 },
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
            expect(markLectureAsWatchedMock).toHaveBeenCalledWith({
                coreProblemId: 'cp-1',
                watchedDurationSeconds: 240,
                videoDurationSeconds: 240,
            });
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
            expect(printUrl.searchParams.get('view')).toBe('pdf');
        });
    });

    it('Android 系タッチ端末では HTML 印刷ページへ遷移する', async () => {
        vi.mocked(getPreferredPrintView).mockReturnValue('html');
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
            const printUrl = new URL(mockPopup.location.href, 'http://localhost');
            expect(printUrl.searchParams.get('view')).toBe('html');
        });
    });

    it('印刷可否の確認中は科目選択とセット変更を受け付けない', async () => {
        const gateCheck = createDeferred<{ ok: boolean; json: () => Promise<{ blocked: boolean }> }>();
        mockFetch.mockReturnValue(gateCheck.promise);

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
        fireEvent.pointerDown(document.body);

        expect(screen.getByRole('button', { name: '確認中...' })).toBeDisabled();
        const incrementButton = screen.getByRole('button', { name: 'セット数を増やす' });
        expect(incrementButton).toBeDisabled();
        fireEvent.click(incrementButton);

        fireEvent.click(screen.getByText('English'));

        await waitFor(() => {
            expect(screen.getByText('10問 / 1セット')).toBeInTheDocument();
        });

        gateCheck.resolve({
            ok: true,
            json: async () => ({ blocked: false }),
        });

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    it('視聴状態の保存中は閉じる操作を受け付けない', async () => {
        const watchSave = createDeferred<boolean>();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
                lectureVideos: [
                    { title: '導入', url: YOUTUBE_URL_1 },
                ],
            }),
        });
        markLectureAsWatchedMock.mockReturnValue(watchSave.promise);

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        );

        fireEvent.click(screen.getByText('English'));
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
        await screen.findByText('「主語と動詞」がアンロックされました');

        const previewButton = screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' });
        fireEvent.click(previewButton);
        fireEvent.click(screen.getByText('mock-end-video-0'));

        const closeButton = await screen.findByRole('button', { name: '閉じる' });
        expect(closeButton).toBeDisabled();

        fireEvent.click(closeButton);
        fireEvent.click(screen.getByText('mock-close-video'));

        expect(screen.getByText('「主語と動詞」がアンロックされました')).toBeInTheDocument();
        expect(screen.getByTestId('mock-fullscreen-player')).toBeInTheDocument();

        watchSave.resolve(true);

        await waitFor(() => {
            expect(markLectureAsWatchedMock).toHaveBeenCalledWith({
                coreProblemId: 'cp-1',
                watchedDurationSeconds: 120,
                videoDurationSeconds: 120,
            });
            expect(screen.queryByText('「主語と動詞」がアンロックされました')).not.toBeInTheDocument();
            expect(screen.queryByTestId('mock-fullscreen-player')).not.toBeInTheDocument();
        });
    });

    it('視聴状態の保存が例外で失敗した場合はエラーを表示して再視聴を促す', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    blocked: true,
                    coreProblemId: 'cp-1',
                    coreProblemName: '主語と動詞',
                    lectureVideos: [
                        { title: '導入', url: YOUTUBE_URL_1 },
                    ],
                }),
            });
            markLectureAsWatchedMock.mockRejectedValue(new Error('network error'));

            render(
                <PrintSelector
                    subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
                />
            );

            fireEvent.click(screen.getByText('English'));
            fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
            await screen.findByText('「主語と動詞」がアンロックされました');

            fireEvent.click(screen.getByRole('button', { name: '主語と動詞 の講義動画プレビューを再生' }));
            fireEvent.click(screen.getByText('mock-end-video-0'));

            await waitFor(() => {
                expect(markLectureAsWatchedMock).toHaveBeenCalledWith({
                    coreProblemId: 'cp-1',
                    watchedDurationSeconds: 120,
                    videoDurationSeconds: 120,
                });
                expect(screen.queryByTestId('mock-fullscreen-player')).not.toBeInTheDocument();
                expect(screen.getByText('視聴状態の保存に失敗しました。もう一度最初から視聴してください。')).toBeInTheDocument();
                expect(screen.getByText('「主語と動詞」がアンロックされました')).toBeInTheDocument();
                expect(mockRouter.refresh).not.toHaveBeenCalled();
            });
        } finally {
            consoleErrorSpy.mockRestore();
        }
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
