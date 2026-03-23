import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { appendCacheBust } from '@/components/print/cache-bust';
import { HtmlPrintClient } from '@/components/print/html-print-client';
import { PrintAssistClient } from '@/components/print/print-assist-client';
import { PdfPreviewClient } from '@/components/print/pdf-preview-client';
import {
    buildPrintDocumentMarkup,
    PRINT_DOCUMENT_CSS,
} from '@/lib/print-document';
import { getPrintData } from '@/lib/print-service';
import {
    detectPreferredPrintViewFromEnvironment,
    type PrintView,
    sanitizePrintView,
} from '@/lib/print-view';

type PrintSearchParams = {
    subjectId?: string;
    coreProblemId?: string;
    sets?: string;
    gateChecked?: string;
    view?: string;
};

interface StudentPrintPageProps {
    searchParams: PrintSearchParams;
    redirectPathIfMissing: string;
    printPagePath: string;
    targetUserId: string;
    includeTargetUserIdInApiQuery?: boolean;
}

export async function SharedStudentPrintPage({
    searchParams,
    redirectPathIfMissing,
    printPagePath,
    targetUserId,
    includeTargetUserIdInApiQuery = false,
}: StudentPrintPageProps) {
    if (!searchParams.subjectId) {
        redirect(redirectPathIfMissing);
    }

    const safeSets = sanitizeSets(searchParams.sets);
    const pageView = sanitizePrintView(searchParams.view);
    const pageQuery = new URLSearchParams({
        subjectId: searchParams.subjectId,
        sets: String(safeSets),
    });
    const apiQuery = new URLSearchParams({
        subjectId: searchParams.subjectId,
        sets: String(safeSets),
    });

    if (searchParams.coreProblemId) {
        pageQuery.set('coreProblemId', searchParams.coreProblemId);
        apiQuery.set('coreProblemId', searchParams.coreProblemId);
    }

    if (searchParams.gateChecked) {
        pageQuery.set('gateChecked', searchParams.gateChecked);
    }

    if (includeTargetUserIdInApiQuery) {
        apiQuery.set('targetUserId', targetUserId);
    }

    const pdfUrl = appendCacheBust(`/api/print/pdf?${apiQuery.toString()}`);
    const assistViewUrl = buildPrintPageUrl({
        printPagePath,
        query: pageQuery,
        view: 'assist',
    });
    const htmlViewUrl = buildPrintPageUrl({
        printPagePath,
        query: pageQuery,
        view: 'html',
    });

    if (pageView === 'assist') {
        return (
            <PrintAssistClient
                backFallbackPath={redirectPathIfMissing}
                htmlViewUrl={htmlViewUrl}
                pdfUrl={pdfUrl}
            />
        );
    }

    if (pageView === 'html') {
        const data = await getPrintData(
            targetUserId,
            searchParams.subjectId,
            searchParams.coreProblemId,
            safeSets,
        );

        if (!data) {
            return (
                <div className="mx-auto max-w-3xl px-4 py-10">
                    <p className="rounded-md bg-white p-6 text-sm text-muted-foreground shadow-sm">
                        印刷データが見つかりませんでした。
                    </p>
                </div>
            );
        }

        const { markup } = await buildPrintDocumentMarkup({
            studentName: data.studentName,
            studentLoginId: data.studentLoginId,
            subjectName: data.subjectName,
            problemSets: data.problemSets,
            unitToken: data.unitToken,
        });

        return (
            <>
                <style dangerouslySetInnerHTML={{ __html: `${PRINT_DOCUMENT_CSS}\n${HTML_PRINT_PAGE_CSS}` }} />
                <div className="print-html-page min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
                    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
                        <HtmlPrintClient
                            backFallbackPath={redirectPathIfMissing}
                            pdfUrl={pdfUrl}
                        />
                        <div
                            className="print-html-document"
                            dangerouslySetInnerHTML={{ __html: markup }}
                        />
                    </div>
                </div>
            </>
        );
    }

    const requestHeaders = await headers();
    const serverPreferredPrintView = detectPreferredPrintViewFromEnvironment({
        userAgent: requestHeaders.get('user-agent') ?? undefined,
    });

    return (
        <PdfPreviewClient
            pdfUrl={pdfUrl}
            assistViewUrl={assistViewUrl}
            htmlViewUrl={htmlViewUrl}
            backFallbackPath={redirectPathIfMissing}
            serverPreferredPrintView={serverPreferredPrintView}
        />
    );
}

function sanitizeSets(raw?: string): number {
    if (!raw) return 1;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 1), 10);
}

function buildPrintPageUrl(input: {
    printPagePath: string;
    query: URLSearchParams;
    view: PrintView;
}) {
    const query = new URLSearchParams(input.query);
    query.set('view', input.view);
    return appendCacheBust(`${input.printPagePath}?${query.toString()}`);
}

const HTML_PRINT_PAGE_CSS = `
.print-html-document {
    border-radius: 0.5rem;
}

@media print {
    @page {
        size: A4;
        margin: 6mm;
    }

    body > header,
    body > [data-sonner-toaster],
    .print-toolbar {
        display: none !important;
    }

    .print-html-page {
        min-height: auto;
        background: #ffffff !important;
        padding: 0 !important;
    }

    .sullivan-print-document,
    .sullivan-print-document .sheet,
    .sullivan-print-document .sheet-inner,
    .sullivan-print-document .question-list,
    .sullivan-print-document .answer-list,
    .sullivan-print-document .question-row,
    .sullivan-print-document .answer-row {
        overflow: visible !important;
    }

    .print-html-page > div,
    .print-html-document {
        max-width: none !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
    }

    .sullivan-print-document .sheet-header {
        display: table !important;
        width: 100%;
        table-layout: fixed;
        margin-bottom: 4mm;
    }

    .sullivan-print-document .sheet-title-wrap {
        display: table-cell !important;
        vertical-align: bottom;
        padding-right: 6mm;
    }

    .sullivan-print-document .sheet-title {
        font-size: 18px;
        line-height: 1.15;
    }

    .sullivan-print-document .student-info {
        display: block;
        margin-top: 1.5mm;
        font-size: 14px;
        line-height: 1.3;
    }

    .sullivan-print-document .sheet-type {
        display: table-cell !important;
        width: 24mm;
        text-align: right;
        vertical-align: bottom;
        font-size: 12px;
    }

    .sullivan-print-document .question-row {
        display: table !important;
        width: 100%;
        table-layout: fixed;
        margin-bottom: 2.75mm;
        break-inside: avoid-page;
        page-break-inside: avoid;
    }

    .sullivan-print-document .question-id {
        display: table-cell !important;
        width: 18mm;
        min-width: 0;
        font-size: 14px;
        line-height: 1.25;
        padding: 0.15mm 2.5mm 0 0;
        vertical-align: top;
    }

    .sullivan-print-document .question-text {
        display: table-cell !important;
        font-size: 14px;
        line-height: 1.35;
        padding: 0 0 2mm;
        min-height: 0;
        vertical-align: top;
    }

    .sullivan-print-document .answer-sheet .sheet-inner {
        min-height: 0 !important;
        display: block !important;
    }

    .sullivan-print-document .qr-image {
        width: 20mm;
        height: 20mm;
    }

    .sullivan-print-document .answer-list {
        margin-top: 4.5mm;
    }

    .sullivan-print-document .answer-row {
        display: table !important;
        width: 100%;
        table-layout: fixed;
        margin-bottom: 4.75mm;
        break-inside: avoid-page;
        page-break-inside: avoid;
    }

    .sullivan-print-document .answer-id {
        display: table-cell !important;
        width: 20mm;
        min-width: 0;
        font-size: 16px;
        padding-right: 2.5mm;
        vertical-align: bottom;
    }

    .sullivan-print-document .answer-prefix {
        display: table-cell !important;
        width: 10mm;
        min-width: 0;
        font-size: 16px;
        padding-right: 2mm;
        vertical-align: bottom;
    }

    .sullivan-print-document .answer-line {
        display: table-cell !important;
        min-height: 5.5mm;
        vertical-align: bottom;
    }

    .sullivan-print-document .sheet-footer {
        margin-top: 6mm;
    }
}
`;
