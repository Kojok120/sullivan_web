import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { SharedStudentPrintPage } from './shared-student-print-page';
import { getPrintData } from '@/lib/print-service';
import { buildPrintDocumentMarkup } from '@/lib/print-document';

const {
    redirectMock,
    headersMock,
    htmlPrintClientMock,
    printAssistClientMock,
    pdfPreviewClientMock,
    getPrintDataMock,
    buildPrintDocumentMarkupMock,
} = vi.hoisted(() => ({
    redirectMock: vi.fn((path?: string) => {
        throw new Error(`NEXT_REDIRECT:${path ?? ''}`);
    }),
    headersMock: vi.fn(async () => new Headers({
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
    })),
    htmlPrintClientMock: vi.fn(({ pdfUrl }: { pdfUrl: string }) => <div data-testid="html-print-client">{pdfUrl}</div>),
    printAssistClientMock: vi.fn(({ pdfUrl, htmlViewUrl }: { pdfUrl: string; htmlViewUrl: string }) => (
        <div
            data-testid="print-assist-client"
            data-pdf-url={pdfUrl}
            data-html-url={htmlViewUrl}
        />
    )),
    pdfPreviewClientMock: vi.fn((props: {
        pdfUrl: string;
        assistViewUrl?: string;
        htmlViewUrl?: string;
        preferredPrintView?: string;
    }) => (
        <div
            data-testid="pdf-preview-client"
            data-pdf-url={props.pdfUrl}
            data-assist-url={props.assistViewUrl}
            data-html-url={props.htmlViewUrl}
            data-preferred-view={props.preferredPrintView}
        />
    )),
    getPrintDataMock: vi.fn(),
    buildPrintDocumentMarkupMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}));

vi.mock('next/headers', () => ({
    headers: headersMock,
}));

vi.mock('@/components/print/html-print-client', () => ({
    HtmlPrintClient: htmlPrintClientMock,
}));

vi.mock('@/components/print/print-assist-client', () => ({
    PrintAssistClient: printAssistClientMock,
}));

vi.mock('@/components/print/pdf-preview-client', () => ({
    PdfPreviewClient: pdfPreviewClientMock,
}));

vi.mock('@/lib/print-service', () => ({
    getPrintData: getPrintDataMock,
}));

vi.mock('@/lib/print-document', () => ({
    buildPrintDocumentMarkup: buildPrintDocumentMarkupMock,
    PRINT_DOCUMENT_CSS: '.mock-print-document {}',
}));

describe('SharedStudentPrintPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getPrintData).mockResolvedValue({
            studentName: '山田花子',
            studentLoginId: 'S0001',
            subjectName: '英語',
            problems: [{ id: 'problem-1', customId: 'E-1', question: 'Question 1', order: 1 }],
            problemSets: [[{ id: 'problem-1', customId: 'E-1', question: 'Question 1', order: 1 }]],
            unitToken: 'unit-token',
        });
        vi.mocked(buildPrintDocumentMarkup).mockResolvedValue({
            markup: '<div>rendered markup</div>',
            cssText: '.mock-print-document {}',
        });
    });

    it('view=assist では印刷アシストのみを描画し、印刷データを構築しない', async () => {
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
        expect(assistClient.getAttribute('data-html-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=html');
        expect(getPrintData).not.toHaveBeenCalled();
        expect(buildPrintDocumentMarkup).not.toHaveBeenCalled();
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

    it('view=html では印刷データを構築して HTML 印刷画面を描画する', async () => {
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

        expect(getPrintData).toHaveBeenCalledWith('student-1', 'subject-1', undefined, 2);
        expect(buildPrintDocumentMarkup).toHaveBeenCalled();
        expect(screen.getByTestId('html-print-client')).toHaveTextContent('/api/print/pdf?subjectId=subject-1&sets=2');
        expect(screen.getByText('rendered markup')).toBeInTheDocument();
    });

    it('view=pdf では PDF プレビューへ assist/html の両方の URL を渡す', async () => {
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
        expect(pdfClient.getAttribute('data-pdf-url')).toContain('/api/print/pdf?subjectId=subject-1&sets=2');
        expect(pdfClient.getAttribute('data-assist-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=assist');
        expect(pdfClient.getAttribute('data-html-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=html');
        expect(pdfClient.getAttribute('data-preferred-view')).toBe('html');
        expect(getPrintData).not.toHaveBeenCalled();
    });

    it('iPhone UA では assist を優先して PDF プレビューへ渡す', async () => {
        headersMock.mockResolvedValueOnce(new Headers({
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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
        expect(pdfClient.getAttribute('data-pdf-url')).toContain('/api/print/pdf?subjectId=subject-1&sets=2');
        expect(pdfClient.getAttribute('data-assist-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=assist');
        expect(pdfClient.getAttribute('data-html-url')).toContain('/dashboard/print?subjectId=subject-1&sets=2&view=html');
        expect(pdfClient.getAttribute('data-preferred-view')).toBe('assist');
        expect(getPrintData).not.toHaveBeenCalled();
    });
});
