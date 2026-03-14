import { redirect } from 'next/navigation';

import { appendCacheBust } from '@/components/print/cache-bust';
import { HtmlPrintClient } from '@/components/print/html-print-client';
import { PdfPreviewClient } from '@/components/print/pdf-preview-client';
import {
    buildPrintDocumentMarkup,
    PRINT_DOCUMENT_CSS,
} from '@/lib/print-document';
import { getPrintData } from '@/lib/print-service';
import {
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
    const htmlViewUrl = buildPrintPageUrl({
        printPagePath,
        query: pageQuery,
        view: 'html',
    });

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

    return (
        <PdfPreviewClient
            pdfUrl={pdfUrl}
            htmlViewUrl={htmlViewUrl}
            backFallbackPath={redirectPathIfMissing}
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

    .print-html-page > div,
    .print-html-document {
        max-width: none !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
    }
}
`;
