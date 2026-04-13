import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { requireProblemAuthor } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreatePrintPdf } from '@/lib/print-pdf/render-service';
import { createProblemAssetSignedUrl } from '@/lib/problem-assets';
import { withNoStoreHeaders } from '@/lib/no-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireProblemCustomId(problem: { id: string; customId: string | null }): string {
    if (!problem.customId) {
        throw new Error(`Problem ${problem.id} に customId が設定されていません`);
    }

    return problem.customId;
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ problemId: string }> },
) {
    await requireProblemAuthor();

    const { problemId } = await context.params;
    const revisionId = request.nextUrl.searchParams.get('revisionId')?.trim();

    const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        include: {
            subject: true,
            publishedRevision: {
                include: { assets: true },
            },
            revisions: {
                include: { assets: true },
                orderBy: { revisionNumber: 'desc' },
            },
        },
    });

    if (!problem) {
        return new Response('Problem not found', { status: 404 });
    }

    const revision =
        (revisionId
            ? problem.revisions.find((candidate) => candidate.id === revisionId)
            : null)
        ?? problem.revisions.find((candidate) => candidate.status === 'DRAFT')
        ?? problem.publishedRevision;

    if (!revision) {
        return new Response('Revision not found', { status: 404 });
    }

    const customId = requireProblemCustomId(problem);

    const printableProblem = {
        id: problem.id,
        customId,
        question: problem.question,
        order: problem.order,
        problemType: problem.problemType,
        contentFormat: 'STRUCTURED_V1',
        status: problem.status,
        publishedRevisionId: revision.id,
        structuredContent: revision.structuredContent as never,
        answerSpec: revision.answerSpec as never,
        printConfig: revision.printConfig as never,
        assets: await Promise.all(revision.assets.map(async (asset) => ({
            id: asset.id,
            kind: asset.kind,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            storageKey: asset.storageKey,
            inlineContent: asset.inlineContent,
            width: asset.width,
            height: asset.height,
            signedUrl: asset.storageKey ? await createProblemAssetSignedUrl(asset.storageKey) : null,
        }))),
    };

    const cacheKey = [
        'admin-preview',
        problem.id,
        revision.id,
        crypto.createHash('sha1').update(JSON.stringify(revision.updatedAt)).digest('hex').slice(0, 8),
    ].join(':');

    const pdf = await getOrCreatePrintPdf({
        cacheKey,
        studentName: 'プレビュー',
        studentLoginId: 'ADMIN',
        subjectName: `${problem.subject.name} プレビュー`,
        problemSets: [[printableProblem]],
    });

    return new Response(new Uint8Array(pdf.buffer), {
        status: 200,
        headers: withNoStoreHeaders({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="problem-preview-${customId}.pdf"`,
            'X-Frame-Options': 'SAMEORIGIN',
        }),
    });
}
