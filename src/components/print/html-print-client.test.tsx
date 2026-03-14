import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';

import { HtmlPrintClient } from './html-print-client';

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

describe('HTML印刷クライアント', () => {
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
        vi.mocked(useRouter).mockReturnValue(mockRouter);
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
});
