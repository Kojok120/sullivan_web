import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';

import { HtmlPrintClient } from './html-print-client';

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

describe('HTML印刷クライアント', () => {
    let originalOpenerDescriptor: PropertyDescriptor | undefined;

    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(useRouter).mockReturnValue(mockRouter);
        originalOpenerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener');
        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: null,
        });
    });

    afterEach(() => {
        try {
            vi.runOnlyPendingTimers();
        } catch {
            // 実タイマーに切り替えたケースでは pending timers を処理しない
        }
        vi.useRealTimers();
        vi.restoreAllMocks();

        if (originalOpenerDescriptor) {
            Object.defineProperty(window, 'opener', originalOpenerDescriptor);
        } else {
            delete (window as { opener?: Window | null }).opener;
        }
    });

    it('印刷するボタンで window.print を呼び出す', () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

        render(
            <HtmlPrintClient
                backFallbackPath="/dashboard"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '印刷する' }));

        expect(printSpy).toHaveBeenCalledTimes(1);
        printSpy.mockRestore();
    });

    it('PDFを開くリンクに PDF URL を設定する', () => {
        render(
            <HtmlPrintClient
                backFallbackPath="/dashboard"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        expect(screen.getByRole('link', { name: 'PDFを開く' })).toHaveAttribute(
            'href',
            '/api/print/pdf?subjectId=subject-1&sets=1',
        );
    });

    it('opener がある場合は元タブをフォーカスして現在タブを閉じる', () => {
        const openerFocus = vi.fn();
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: { focus: openerFocus, closed: false },
        });

        render(
            <HtmlPrintClient
                backFallbackPath="/dashboard"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '戻る' }));

        expect(openerFocus).toHaveBeenCalledTimes(1);
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(mockRouter.back).not.toHaveBeenCalled();
        expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('opener がなく履歴がない場合はタブを閉じてフォールバック遷移する', () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
        vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);

        render(
            <HtmlPrintClient
                backFallbackPath="/dashboard"
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

    it('opener がなく履歴がある場合は通常の戻るを実行する', () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
        vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);

        render(
            <HtmlPrintClient
                backFallbackPath="/dashboard"
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '戻る' }));

        expect(mockRouter.back).toHaveBeenCalledTimes(1);
        expect(closeSpy).not.toHaveBeenCalled();
        expect(mockRouter.push).not.toHaveBeenCalled();
    });
});
