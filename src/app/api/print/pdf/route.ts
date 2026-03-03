import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
    canAccessUserWithinClassroomScope,
    isAdminRole,
    isTeacherRole,
} from '@/lib/authorization';
import { getPrintGate } from '@/lib/print-gate-service';
import { getPrintData } from '@/lib/print-service';
import {
    buildPrintPdfCacheKey,
    buildProblemIdsHash,
    getOrCreatePrintPdf,
} from '@/lib/print-pdf/render-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_TIMEOUT_MS = 60_000;

export async function GET(request: NextRequest) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + API_TIMEOUT_MS;

    try {
        const session = await getCurrentUser();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const subjectId = request.nextUrl.searchParams.get('subjectId')?.trim();
        if (!subjectId) {
            return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
        }

        const sets = sanitizeSets(request.nextUrl.searchParams.get('sets'));
        const coreProblemId = toOptionalString(request.nextUrl.searchParams.get('coreProblemId'));
        const targetUserIdParam = toOptionalString(request.nextUrl.searchParams.get('targetUserId'));
        // クライアントの挙動用フラグ。API側では入力互換のため受け付けるだけにする。
        void request.nextUrl.searchParams.get('autoprint');

        const targetUserId = await resolveTargetUserId({
            actorUserId: session.userId,
            actorRole: session.role,
            requestedTargetUserId: targetUserIdParam,
        });

        if (!targetUserId.allowed) {
            return NextResponse.json({ error: targetUserId.errorMessage }, { status: targetUserId.statusCode });
        }

        if (session.role === 'STUDENT') {
            const gate = await getPrintGate(session.userId, subjectId);
            if (gate.blocked) {
                return NextResponse.json(
                    {
                        error: 'print blocked by lecture gate',
                        blocked: true,
                        coreProblemId: gate.coreProblemId,
                        coreProblemName: gate.coreProblemName,
                    },
                    { status: 403 },
                );
            }
        }

        const data = await withDeadline(
            getPrintData(targetUserId.userId, subjectId, coreProblemId, sets),
            deadlineAt,
            'print data load timeout',
        );

        if (!data) {
            return NextResponse.json({ error: 'Print data not found' }, { status: 404 });
        }

        const problemIdsHash = buildProblemIdsHash(data.problemSets);
        const cacheKey = buildPrintPdfCacheKey({
            targetUserId: targetUserId.userId,
            subjectId,
            coreProblemId: coreProblemId ?? undefined,
            sets,
            problemIdsHash,
        });

        const pdf = await withDeadline(
            getOrCreatePrintPdf({
                cacheKey,
                studentName: data.studentName,
                studentLoginId: data.studentLoginId,
                subjectName: data.subjectName,
                problemSets: data.problemSets,
                unitToken: data.unitToken,
            }),
            deadlineAt,
            'pdf render timeout',
        );

        const ifNoneMatch = request.headers.get('if-none-match');
        if (ifNoneMatch && ifNoneMatch === pdf.etag) {
            return new NextResponse(null, {
                status: 304,
                headers: {
                    ETag: pdf.etag,
                    'Cache-Control': 'private, max-age=300',
                },
            });
        }

        const filename = buildFilename({
            studentLoginId: data.studentLoginId,
            subjectId,
            digest: crypto.createHash('sha1').update(cacheKey).digest('hex').slice(0, 8),
        });

        console.info('[PrintPDF]', JSON.stringify({
            actorUserId: session.userId,
            targetUserId: targetUserId.userId,
            actorRole: session.role,
            subjectId,
            coreProblemId,
            sets,
            cacheStatus: pdf.cacheStatus,
            pageCount: pdf.pageCount,
            pdfSizeBytes: pdf.buffer.length,
            renderMs: pdf.renderMs,
            totalMs: Date.now() - startedAt,
            errorType: null,
        }));

        return new Response(new Uint8Array(pdf.buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'private, max-age=300',
                ETag: pdf.etag,
                'X-Render-Ms': String(pdf.renderMs),
                'X-Page-Count': String(pdf.pageCount),
            },
        });
    } catch (error) {
        console.error('[PrintPDF]', JSON.stringify({
            totalMs: Date.now() - startedAt,
            errorType: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
        }));

        return NextResponse.json({ error: 'Failed to generate print PDF' }, { status: 500 });
    }
}

async function resolveTargetUserId(params: {
    actorUserId: string;
    actorRole: string;
    requestedTargetUserId?: string;
}): Promise<
    | { allowed: true; userId: string }
    | { allowed: false; statusCode: number; errorMessage: string }
> {
    const requested = params.requestedTargetUserId;

    if (!requested) {
        return { allowed: true, userId: params.actorUserId };
    }

    if (params.actorRole === 'STUDENT') {
        if (requested !== params.actorUserId) {
            return {
                allowed: false,
                statusCode: 403,
                errorMessage: 'Students cannot access other users',
            };
        }
        return { allowed: true, userId: params.actorUserId };
    }

    if (isAdminRole(params.actorRole)) {
        return { allowed: true, userId: requested };
    }

    if (isTeacherRole(params.actorRole)) {
        const allowed = await canAccessUserWithinClassroomScope({
            actorUserId: params.actorUserId,
            actorRole: params.actorRole,
            targetUserId: requested,
        });

        if (!allowed) {
            return {
                allowed: false,
                statusCode: 403,
                errorMessage: 'Teachers cannot access students outside classroom scope',
            };
        }

        return { allowed: true, userId: requested };
    }

    return {
        allowed: false,
        statusCode: 403,
        errorMessage: 'Forbidden',
    };
}

function sanitizeSets(raw: string | null): number {
    if (!raw) return 1;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 1), 10);
}

function toOptionalString(value: string | null): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function buildFilename(input: { studentLoginId: string; subjectId: string; digest: string }): string {
    const student = sanitizeFilenamePart(input.studentLoginId);
    const subject = sanitizeFilenamePart(input.subjectId);
    return `sullivan_${student}_${subject}_${input.digest}.pdf`;
}

function sanitizeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(label));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function withDeadline<T>(promise: Promise<T>, deadlineAt: number, label: string): Promise<T> {
    const remaining = Math.max(1_000, deadlineAt - Date.now());
    return await withTimeout(promise, remaining, label);
}
