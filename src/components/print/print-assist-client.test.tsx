import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';

import { PrintAssistClient } from './print-assist-client';

const { toastErrorMock } = vi.hoisted(() => ({
    toastErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: toastErrorMock,
    },
}));

describe('印刷アシストクライアント', () => {
    let originalOpenerDescriptor: PropertyDescriptor | undefined;
    let originalShareDescriptor: PropertyDescriptor | undefined;
    let originalCanShareDescriptor: PropertyDescriptor | undefined;

    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    };

    const buildPdfResponse = (contentDisposition = 'inline; filename="sheet.pdf"') => new Response(
        new Blob(['pdf'], { type: 'application/pdf' }),
        {
            status: 200,
            headers: {
                'Content-Disposition': contentDisposition,
                'Content-Type': 'application/pdf',
            },
        },
    );

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
        vi.useRealTimers();
        vi.mocked(useRouter).mockReturnValue(mockRouter);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(buildPdfResponse()));
        originalOpenerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener');
        originalShareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share');
        originalCanShareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'canShare');
        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: null,
        });
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: vi.fn().mockResolvedValue(undefined),
        });
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue(true),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();

        if (originalOpenerDescriptor) {
            Object.defineProperty(window, 'opener', originalOpenerDescriptor);
        } else {
            delete (window as { opener?: Window | null }).opener;
        }

        if (originalShareDescriptor) {
            Object.defineProperty(navigator, 'share', originalShareDescriptor);
        } else {
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                writable: true,
                value: undefined,
            });
        }

        if (originalCanShareDescriptor) {
            Object.defineProperty(navigator, 'canShare', originalCanShareDescriptor);
        } else {
            Object.defineProperty(navigator, 'canShare', {
                configurable: true,
                writable: true,
                value: undefined,
            });
        }
    });

    it('PDF 取得中は主ボタンを無効化する', async () => {
        const deferred = createDeferred<Response>();
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(deferred.promise));

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        expect(screen.getByRole('button', { name: '印刷メニューを準備中...' })).toBeDisabled();

        deferred.resolve(buildPdfResponse());

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });
    });

    it('共有メニューを開くとファイル共有を実行する', async () => {
        const shareMock = vi.fn().mockResolvedValue(undefined);
        const canShareMock = vi.fn().mockReturnValue(true);
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: shareMock,
        });
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            writable: true,
            value: canShareMock,
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        await waitFor(() => {
            expect(canShareMock).toHaveBeenCalledTimes(1);
            expect(shareMock).toHaveBeenCalledTimes(1);
        });

        expect(canShareMock).toHaveBeenCalledWith({
            files: [
                expect.objectContaining({
                    name: 'sheet.pdf',
                    type: 'application/pdf',
                }),
            ],
        });
        expect(shareMock).toHaveBeenCalledWith({
            files: [
                expect.objectContaining({
                    name: 'sheet.pdf',
                    type: 'application/pdf',
                }),
            ],
            title: 'sheet.pdf',
        });
    });

    it('pdfUrl 切り替え直後は新しい PDF だけを共有する', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(buildPdfResponse('inline; filename="sheet-1.pdf"'))
            .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
            .mockResolvedValueOnce(buildPdfResponse('inline; filename="sheet-2.pdf"'));
        vi.stubGlobal('fetch', fetchMock);

        const shareMock = vi.fn().mockResolvedValue(undefined);
        const canShareMock = vi.fn().mockReturnValue(true);
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: shareMock,
        });
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            writable: true,
            value: canShareMock,
        });

        const { rerender } = render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        rerender(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-2&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-2&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(shareMock).toHaveBeenCalledTimes(1);
        });

        expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/print/pdf?subjectId=subject-2&sets=1');
        expect(canShareMock).toHaveBeenCalledWith({
            files: [
                expect.objectContaining({
                    name: 'sheet-2.pdf',
                    type: 'application/pdf',
                }),
            ],
        });
        expect(shareMock).toHaveBeenCalledWith({
            files: [
                expect.objectContaining({
                    name: 'sheet-2.pdf',
                    type: 'application/pdf',
                }),
            ],
            title: 'sheet-2.pdf',
        });
    });

    it('filename* を優先してファイル名を取り出す', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            buildPdfResponse("inline; filename*=UTF-8''lesson%20sheet.pdf"),
        ));
        const shareMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: shareMock,
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        await waitFor(() => {
            expect(shareMock).toHaveBeenCalledTimes(1);
        });

        expect(shareMock).toHaveBeenCalledWith({
            files: [
                expect.objectContaining({
                    name: 'lesson sheet.pdf',
                }),
            ],
            title: 'lesson sheet.pdf',
        });
    });

    it('AbortError では toast を出さない', async () => {
        const shareMock = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: shareMock,
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        await waitFor(() => {
            expect(shareMock).toHaveBeenCalledTimes(1);
        });

        expect(toastErrorMock).not.toHaveBeenCalled();
    });

    it('共有失敗時は toast を表示し、PDF と HTML の退避リンクは常に残す', async () => {
        const shareMock = vi.fn().mockRejectedValue(new Error('boom'));
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            writable: true,
            value: shareMock,
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith('共有メニューを開けませんでした。');
        });
        expect(screen.getByRole('link', { name: 'PDFを開く' })).toHaveAttribute(
            'href',
            '/api/print/pdf?subjectId=subject-1&sets=1',
        );
        expect(screen.getByRole('link', { name: 'HTML印刷を開く' })).toHaveAttribute(
            'href',
            '/dashboard/print?subjectId=subject-1&sets=1&view=html',
        );
    });

    it('ファイル共有非対応時は toast を表示し、HTML 印刷へ退避できる', async () => {
        const canShareMock = vi.fn().mockReturnValue(false);
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            writable: true,
            value: canShareMock,
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '印刷メニューを開く' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: '印刷メニューを開く' }));

        expect(toastErrorMock).toHaveBeenCalledWith('この端末では共有メニューを開けません。HTML印刷をお試しください。');
        expect(screen.getByRole('link', { name: 'HTML印刷を開く' })).toHaveAttribute(
            'href',
            '/dashboard/print?subjectId=subject-1&sets=1&view=html',
        );
    });

    it('opener がある場合は元タブをフォーカスして現在タブを閉じる', async () => {
        const openerFocus = vi.fn();
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: { focus: openerFocus, closed: false },
        });

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '戻る' }));

        expect(openerFocus).toHaveBeenCalledTimes(1);
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('opener がなく履歴がない場合はタブを閉じてフォールバック遷移する', () => {
        vi.useFakeTimers();
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
        vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);

        render(
            <PrintAssistClient
                backFallbackPath="/dashboard"
                htmlViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=html"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '戻る' }));
        act(() => {
            vi.advanceTimersByTime(150);
        });

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
        expect(mockRouter.back).not.toHaveBeenCalled();
    });
});
