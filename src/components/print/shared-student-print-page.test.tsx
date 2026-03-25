import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SharedStudentPrintPage } from './shared-student-print-page';

const {
    redirectMock,
    headersMock,
    printAssistClientMock,
    pdfPreviewClientMock,
} = vi.hoisted(() => ({
    redirectMock: vi.fn((path?: string) => {
        throw new Error(`NEXT_REDIRECT:${path ?? ''}`);
    }),
    headersMock: vi.fn(async () => new Headers({
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
    })),
    printAssistClientMock: vi.fn(({ pdfUrl }: { pdfUrl: string }) => (
        <div
            data-testid="print-assist-client"
            data-pdf-url={pdfUrl}
        />
    )),
    pdfPreviewClientMock: vi.fn((props: {
        pdfUrl: string;
        assistViewUrl?: string;
        serverPreferredPrintView?: string;
    }) => (
        <div
            data-testid="pdf-preview-client"
            data-pdf-url={props.pdfUrl}
            data-assist-url={props.assistViewUrl}
            data-preferred-view={props.serverPreferredPrintView}
        />
    )),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}));

vi.mock('next/headers', () => ({
    headers: headersMock,
}));

vi.mock('@/components/print/print-assist-client', () => ({
    PrintAssistClient: printAssistClientMock,
}));

vi.mock('@/components/print/pdf-preview-client', () => ({
    PdfPreviewClient: pdfPreviewClientMock,
}));

describe('SharedStudentPrintPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('view=assist では印刷アシストのみを描画する', async () => {
        render(await SharedStudentPrintPage({
            searchParams: {
                subjectId: 'subject-1',
                sets: '2',
                view: 'assist',
            },
            redirectPathIfMissing: '/dashboard',
            printPagePath: '/dashboard/print',
            targetUserId: 'student-1',
        }));

        const assistClient = screen.getByTestId('print-assist-client');
        expect(assistClient.getAttribute('data-pdf-url')).toContain('/api/print/pdf?subjectId=subject-1&sets=2');
        expect(screen.queryByTestId('pdf-preview-client')).not.toBeInTheDocument();
    });

    it('subjectId が無い場合は redirect を発生させる', async () => {
        await expect(SharedStudentPrintPage({
            searchParams: {
                sets: '2',
                view: 'pdf',
            },
            redirectPathIfMissing: '/dashboard',
            printPagePath: '/dashboard/print',
            targetUserId: 'student-1',
        })).rejects.toThrow('NEXT_REDIRECT:/dashboard');

        expect(redirectMock).toHaveBeenCalledWith('/dashboard');
    });

    it('view=html は PDF フローへ吸収し、印刷アシスト優先で描画する', async () => {
        render(await SharedStudentPrintPage({
            searchParams: {
                subjectId: 'subject-1',
                sets: '2',
                view: 'html',
            },
            redirectPathIfMissing: '/dashboard',
            printPagePath: '/dashboard/print',
            targetUserId: 'student-1',
        }));

        const pdfClient = screen.getByTestId('pdf-preview-client');
        expect(pdfClient.getAttribute('data-pdf-url')).toContain('/api/print/pdf?subjectId=subject-1&sets=2');
        expect(pdfClient.getAttribute('data-assist-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=assist');
        expect(pdfClient.getAttribute('data-preferred-view')).toBe('assist');
    });

    it('デスクトップ UA では client 判定待ちの auto を渡す', async () => {
        headersMock.mockResolvedValueOnce(new Headers({
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        }));

        render(await SharedStudentPrintPage({
            searchParams: {
                subjectId: 'subject-1',
                sets: '2',
                view: 'pdf',
            },
            redirectPathIfMissing: '/dashboard',
            printPagePath: '/dashboard/print',
            targetUserId: 'student-1',
        }));

        const pdfClient = screen.getByTestId('pdf-preview-client');
        expect(pdfClient.getAttribute('data-preferred-view')).toBe('auto');
    });
});
