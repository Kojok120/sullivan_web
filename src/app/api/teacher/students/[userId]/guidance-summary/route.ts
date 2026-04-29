import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { canAccessUserWithinClassroomScope, isTeacherOrAdminRole } from '@/lib/authorization';
import {
    prepareGuidanceAudioForGemini,
} from '@/lib/guidance-audio-transcoder';
import {
    createPendingGuidanceSummaryRecord,
    failGuidanceSummaryRecord,
    publishGuidanceSummaryJob,
    uploadPreparedGuidanceAudio,
} from '@/lib/guidance-summary-job';
import {
    isSupportedGuidanceAudioMimeType,
    MAX_GUIDANCE_AUDIO_SIZE_LIMIT_BYTES,
    MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL,
    normalizeGuidanceAudioMimeType,
} from '@/lib/guidance-recording';
import {
    deleteGuidanceGeminiFile,
    GuidanceSummaryErrorCode,
    normalizeGuidanceSummaryError,
} from '@/lib/guidance-summary';
import { prisma } from '@/lib/prisma';

const payloadSchema = z.object({
    startedAtIso: z.string().datetime().optional(),
    endedAtIso: z.string().datetime().optional(),
    timeZone: z.string().optional(),
});

function isUploadedAudioFile(value: FormDataEntryValue | null): value is File {
    return typeof value === 'object'
        && value !== null
        && 'arrayBuffer' in value
        && typeof value.arrayBuffer === 'function'
        && 'size' in value
        && typeof value.size === 'number'
        && 'type' in value
        && typeof value.type === 'string'
        && 'name' in value
        && typeof value.name === 'string';
}

export const runtime = 'nodejs';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    if (!isTeacherOrAdminRole(session.role)) {
        return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { userId } = await params;

    if (session.role !== 'ADMIN') {
        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId: userId,
        });
        if (!canAccess) {
            return NextResponse.json({ error: '担当教室外の生徒にはアクセスできません' }, { status: 403 });
        }
    }

    const formData = await request.formData();
    const parsedPayload = payloadSchema.safeParse({
        startedAtIso: formData.get('startedAtIso')?.toString(),
        endedAtIso: formData.get('endedAtIso')?.toString(),
        timeZone: formData.get('timeZone')?.toString(),
    });

    if (!parsedPayload.success) {
        return NextResponse.json({ error: parsedPayload.error.errors[0]?.message ?? '入力値が不正です' }, { status: 400 });
    }

    const audio = formData.get('audio');
    if (!isUploadedAudioFile(audio)) {
        return NextResponse.json({ error: '音声ファイルが必要です' }, { status: 400 });
    }

    const recordedMimeType = normalizeGuidanceAudioMimeType(audio.type);
    if (!isSupportedGuidanceAudioMimeType(recordedMimeType)) {
        return NextResponse.json({ error: 'audio/webm, audio/ogg, audio/mp4 形式の音声のみ対応しています' }, { status: 400 });
    }

    if (audio.size <= 0 || audio.size > MAX_GUIDANCE_AUDIO_SIZE_LIMIT_BYTES) {
        return NextResponse.json({ error: `音声サイズは${MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL}以下にしてください` }, { status: 400 });
    }

    const endedAt = parsedPayload.data.endedAtIso ? new Date(parsedPayload.data.endedAtIso) : new Date();
    const startedAt = parsedPayload.data.startedAtIso ? new Date(parsedPayload.data.startedAtIso) : null;
    const durationMinutes = startedAt
        ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / (1000 * 60)))
        : null;

    const student = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
        },
    });

    if (!student || student.role !== 'STUDENT') {
        return NextResponse.json({ error: '生徒が見つかりません' }, { status: 404 });
    }

    let recordId: string | null = null;
    let uploadedFileName: string | null = null;
    let failureFallbackCode: GuidanceSummaryErrorCode = 'guidance_record_save_failed';
    try {
        const record = await createPendingGuidanceSummaryRecord({
            studentId: userId,
            teacherId: session.userId,
            date: endedAt,
        });
        recordId = record.id;

        failureFallbackCode = 'audio_transcode_failed';
        const geminiAudio = await prepareGuidanceAudioForGemini({
            audioFile: audio,
            mimeType: recordedMimeType,
        });

        failureFallbackCode = 'gemini_upload_failed';
        const uploaded = await uploadPreparedGuidanceAudio({
            recordId,
            audioFile: geminiAudio.audioFile,
        });
        uploadedFileName = uploaded.fileName;

        failureFallbackCode = 'queue_publish_failed';
        await publishGuidanceSummaryJob({
            recordId,
            durationMinutes,
            timeZone: parsedPayload.data.timeZone ?? null,
        });

        return NextResponse.json({
            success: true,
            queued: true,
            recordId,
        }, { status: 202 });
    } catch (error) {
        const normalized = normalizeGuidanceSummaryError(error, failureFallbackCode);

        if (recordId) {
            await failGuidanceSummaryRecord({
                recordId,
                code: normalized.code,
                message: normalized.userMessage,
                notifyTeacher: false,
            });
        }

        if (uploadedFileName) {
            await deleteGuidanceGeminiFile({ fileName: uploadedFileName }).catch((deleteError) => {
                const deleteFailure = normalizeGuidanceSummaryError(deleteError, 'gemini_upload_failed');
                console.warn('[guidance-summary] failed to delete uploaded file:', {
                    recordId,
                    fileName: uploadedFileName,
                    message: deleteFailure.logMessage,
                });
            });
        }

        console.error('[guidance-summary] failed:', {
            studentId: userId,
            teacherId: session.userId,
            recordId,
            audioBytes: audio.size,
            audioMimeType: recordedMimeType,
            code: normalized.code,
            message: normalized.logMessage,
        });

        return NextResponse.json({
            error: normalized.userMessage,
            code: normalized.code,
            recordId,
        }, { status: 500 });
    }
}
