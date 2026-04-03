import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { appendCacheBust, createCacheBustToken } from '@/components/print/cache-bust';
import { PrintAssistClient } from '@/components/print/print-assist-client';
import { PdfPreviewClient } from '@/components/print/pdf-preview-client';
import {
    detectPreferredPrintViewFromEnvironment,
    sanitizePrintView,
} from '@/lib/print-view';

type PrintSearchParams = {
    subjectId?: string;
    coreProblemId?: string;
    sets?: string;
    gateChecked?: string;
    view?: string;
    cb?: string;
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
    const generationToken = searchParams.cb || createCacheBustToken();
    const pageQuery = new URLSearchParams({
        subjectId: searchParams.subjectId,
        sets: String(safeSets),
    });
    const apiQuery = new URLSearchParams({
        subjectId: searchParams.subjectId,
        sets: String(safeSets),
        seed: generationToken,
    });

    if (searchParams.coreProblemId) {
        pageQuery.set('coreProblemId', searchParams.coreProblemId);
        apiQuery.set('coreProblemId', searchParams.coreProblemId);
    }

    if (searchParams.gateChecked) {
        pageQuery.set('gateChecked', searchParams.gateChecked);
    }

    pageQuery.set('cb', generationToken);

    if (includeTargetUserIdInApiQuery) {
        apiQuery.set('targetUserId', targetUserId);
    }

    const pdfUrl = appendCacheBust(`/api/print/pdf?${apiQuery.toString()}`, generationToken);
    const assistViewUrl = buildAssistViewUrl({
        printPagePath,
        query: pageQuery,
        cacheBustToken: generationToken,
    });

    if (pageView === 'assist') {
        return (
            <PrintAssistClient
                backFallbackPath={redirectPathIfMissing}
                pdfUrl={pdfUrl}
            />
        );
    }

    const requestHeaders = await headers();
    const detectedPreferredPrintView = detectPreferredPrintViewFromEnvironment({
        userAgent: requestHeaders.get('user-agent') ?? undefined,
    });
    const serverPreferredPrintView = detectedPreferredPrintView === 'pdf'
        ? 'auto'
        : detectedPreferredPrintView;

    return (
        <PdfPreviewClient
            pdfUrl={pdfUrl}
            assistViewUrl={assistViewUrl}
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

function buildAssistViewUrl(input: {
    printPagePath: string;
    query: URLSearchParams;
    cacheBustToken: string;
}) {
    const query = new URLSearchParams(input.query);
    query.set('view', 'assist');
    return appendCacheBust(`${input.printPagePath}?${query.toString()}`, input.cacheBustToken);
}
