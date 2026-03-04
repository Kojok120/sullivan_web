import { redirect } from 'next/navigation';

import { PdfPreviewClient } from '@/components/print/pdf-preview-client';

type PrintSearchParams = {
    subjectId?: string;
    coreProblemId?: string;
    sets?: string;
    autoprint?: string;
};

interface StudentPrintPageProps {
    searchParams: PrintSearchParams;
    redirectPathIfMissing: string;
    targetUserIdForApi?: string;
}

export async function SharedStudentPrintPage({
    searchParams,
    redirectPathIfMissing,
    targetUserIdForApi,
}: StudentPrintPageProps) {
    if (!searchParams.subjectId) {
        redirect(redirectPathIfMissing);
    }

    const safeSets = sanitizeSets(searchParams.sets);
    const query = new URLSearchParams({
        subjectId: searchParams.subjectId,
        sets: String(safeSets),
    });

    if (searchParams.coreProblemId) {
        query.set('coreProblemId', searchParams.coreProblemId);
    }

    if (targetUserIdForApi) {
        query.set('targetUserId', targetUserIdForApi);
    }

    const autoPrint = searchParams.autoprint !== '0';

    return (
        <PdfPreviewClient
            pdfUrl={`/api/print/pdf?${query.toString()}`}
            autoPrint={autoPrint}
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
