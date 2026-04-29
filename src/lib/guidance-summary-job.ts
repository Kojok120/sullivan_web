import { GuidanceRecordStatus, GuidanceType } from '@prisma/client';

import { DEFAULT_GUIDANCE_SUMMARY_TASK_QUEUE, enqueueCloudTask } from '@/lib/cloud-tasks';
import { GEMINI_GUIDANCE_AUDIO_MIME_TYPE } from '@/lib/guidance-audio-transcoder';
import {
    buildInterviewSummaryPrompt,
    createGuidanceSummaryClient,
    deleteGuidanceGeminiFile,
    generateInterviewSummaryFromGeminiFile,
    getGuidanceSummaryErrorMessage,
    GuidanceSummaryError,
    GuidanceSummaryErrorCode,
    normalizeGuidanceSummaryError,
    uploadGuidanceAudioFileToGemini,
    waitForGeminiFileActive,
} from '@/lib/guidance-summary';
import { formatGuidanceSummaryAsPlainText } from '@/lib/guidance-recording';
import { prisma } from '@/lib/prisma';
import { emitRealtimeEvent } from '@/lib/realtime-events';

export const GUIDANCE_SUMMARY_PENDING_CONTENT = 'AI要約を生成しています。完了するとここに面談記録が表示されます。';

export type GuidanceSummaryTaskPayload = {
    recordId: string;
    durationMinutes: number | null;
    timeZone?: string | null;
};

type GuidanceSummaryRecordForProcessing = Awaited<ReturnType<typeof loadGuidanceSummaryRecordForProcessing>>;

function resolveGuidanceSummaryTaskQueue() {
    return (process.env.GUIDANCE_SUMMARY_TASK_QUEUE || DEFAULT_GUIDANCE_SUMMARY_TASK_QUEUE).trim()
        || DEFAULT_GUIDANCE_SUMMARY_TASK_QUEUE;
}

async function loadGuidanceSummaryRecordForProcessing(recordId: string) {
    return prisma.guidanceRecord.findUnique({
        where: { id: recordId },
        select: {
            id: true,
            studentId: true,
            teacherId: true,
            date: true,
            status: true,
            geminiFileName: true,
            summaryJobAttempts: true,
            student: {
                select: {
                    name: true,
                    loginId: true,
                },
            },
            teacher: {
                select: {
                    name: true,
                    loginId: true,
                },
            },
        },
    });
}

async function emitGuidanceSummaryRealtimeEvent(params: {
    userId: string;
    type: 'guidance_summary_completed' | 'guidance_summary_failed';
    recordId: string;
    studentId: string;
    message?: string | null;
}) {
    await emitRealtimeEvent({
        userId: params.userId,
        type: params.type,
        payload: {
            recordId: params.recordId,
            studentId: params.studentId,
            message: params.message ?? null,
        },
    });
}

export async function publishGuidanceSummaryJob(payload: GuidanceSummaryTaskPayload) {
    await enqueueCloudTask({
        queue: resolveGuidanceSummaryTaskQueue(),
        path: '/api/queue/guidance-summary',
        payload,
    });
}

export async function createPendingGuidanceSummaryRecord(params: {
    studentId: string;
    teacherId: string;
    date: Date;
}) {
    return prisma.guidanceRecord.create({
        data: {
            studentId: params.studentId,
            teacherId: params.teacherId,
            date: params.date,
            content: GUIDANCE_SUMMARY_PENDING_CONTENT,
            type: GuidanceType.INTERVIEW,
            status: GuidanceRecordStatus.PENDING,
        },
        select: {
            id: true,
        },
    });
}

export async function attachGeminiFileToGuidanceRecord(params: {
    recordId: string;
    fileName: string;
}) {
    await prisma.guidanceRecord.updateMany({
        where: {
            id: params.recordId,
            status: GuidanceRecordStatus.PENDING,
        },
        data: {
            geminiFileName: params.fileName,
            summaryErrorCode: null,
            summaryErrorMessage: null,
        },
    });
}

export async function failGuidanceSummaryRecord(params: {
    recordId: string;
    code: GuidanceSummaryErrorCode;
    message?: string | null;
    notifyTeacher?: boolean;
}) {
    const summaryErrorMessage = params.message?.trim() || getGuidanceSummaryErrorMessage(params.code);
    const updated = await prisma.guidanceRecord.updateMany({
        where: { id: params.recordId },
        data: {
            status: GuidanceRecordStatus.FAILED,
            summaryErrorCode: params.code,
            summaryErrorMessage,
            geminiFileName: null,
        },
    });

    if (updated.count === 0) {
        return { updated: false };
    }

    const record = await prisma.guidanceRecord.findUnique({
        where: { id: params.recordId },
        select: {
            teacherId: true,
            studentId: true,
        },
    });

    if (record && params.notifyTeacher !== false) {
        await emitGuidanceSummaryRealtimeEvent({
            userId: record.teacherId,
            type: 'guidance_summary_failed',
            recordId: params.recordId,
            studentId: record.studentId,
            message: summaryErrorMessage,
        });
    }

    return {
        updated: Boolean(record),
        summaryErrorMessage,
    };
}

export async function completeGuidanceSummaryRecord(params: {
    recordId: string;
    content: string;
}) {
    const updated = await prisma.guidanceRecord.updateMany({
        where: { id: params.recordId },
        data: {
            status: GuidanceRecordStatus.COMPLETED,
            content: params.content,
            summaryErrorCode: null,
            summaryErrorMessage: null,
            geminiFileName: null,
        },
    });

    if (updated.count === 0) {
        return { updated: false };
    }

    const record = await prisma.guidanceRecord.findUnique({
        where: { id: params.recordId },
        select: {
            teacherId: true,
            studentId: true,
        },
    });

    if (record) {
        await emitGuidanceSummaryRealtimeEvent({
            userId: record.teacherId,
            type: 'guidance_summary_completed',
            recordId: params.recordId,
            studentId: record.studentId,
        });
    }

    return { updated: Boolean(record) };
}

export async function claimGuidanceSummaryRecord(recordId: string) {
    const claimed = await prisma.guidanceRecord.updateMany({
        where: {
            id: recordId,
            status: GuidanceRecordStatus.PENDING,
        },
        data: {
            status: GuidanceRecordStatus.PROCESSING,
            summaryJobAttempts: { increment: 1 },
            summaryErrorCode: null,
            summaryErrorMessage: null,
        },
    });

    if (claimed.count === 1) {
        const record = await loadGuidanceSummaryRecordForProcessing(recordId);
        if (!record) {
            return {
                shouldProcess: false,
                reason: 'not_found',
            };
        }

        return {
            shouldProcess: true,
            record,
        };
    }

    const existing = await prisma.guidanceRecord.findUnique({
        where: { id: recordId },
        select: {
            status: true,
        },
    });

    return {
        shouldProcess: false,
        reason: existing?.status ?? 'not_found',
    };
}

export async function uploadPreparedGuidanceAudio(params: {
    recordId: string;
    audioFile: File;
}) {
    const uploaded = await uploadGuidanceAudioFileToGemini({
        audioFile: params.audioFile,
        audioMimeType: GEMINI_GUIDANCE_AUDIO_MIME_TYPE,
    });

    await attachGeminiFileToGuidanceRecord({
        recordId: params.recordId,
        fileName: uploaded.fileName,
    });

    return uploaded;
}

export async function processGuidanceSummaryJob(payload: GuidanceSummaryTaskPayload) {
    let claimedRecord: NonNullable<GuidanceSummaryRecordForProcessing> | null = null;
    let geminiFileName: string | null = null;
    let ai: ReturnType<typeof createGuidanceSummaryClient> | null = null;

    try {
        const claimResult = await claimGuidanceSummaryRecord(payload.recordId);
        if (!claimResult.shouldProcess || !claimResult.record) {
            return {
                status: 'noop' as const,
                reason: claimResult.reason ?? 'not_processable',
            };
        }

        claimedRecord = claimResult.record;
        geminiFileName = claimedRecord.geminiFileName;

        if (!geminiFileName) {
            throw new GuidanceSummaryError(
                'guidance_record_missing_file',
                `GuidanceRecord ${payload.recordId} has no geminiFileName`,
            );
        }

        ai = createGuidanceSummaryClient();
        const { fileUri } = await waitForGeminiFileActive({
            ai,
            fileName: geminiFileName,
        });

        const prompt = buildInterviewSummaryPrompt({
            studentName: claimedRecord.student.name || claimedRecord.student.loginId,
            teacherName: claimedRecord.teacher.name || claimedRecord.teacher.loginId || '担当講師',
            recordedAt: claimedRecord.date,
            durationMinutes: payload.durationMinutes,
            timeZone: payload.timeZone,
        });

        const summary = await generateInterviewSummaryFromGeminiFile({
            ai,
            fileUri,
            prompt,
        });

        const completed = await completeGuidanceSummaryRecord({
            recordId: payload.recordId,
            content: formatGuidanceSummaryAsPlainText(summary),
        });

        return {
            status: completed.updated ? 'completed' as const : 'noop' as const,
            reason: completed.updated ? undefined : 'deleted',
        };
    } catch (error) {
        const normalized = normalizeGuidanceSummaryError(error, 'unexpected');
        await failGuidanceSummaryRecord({
            recordId: payload.recordId,
            code: normalized.code,
            message: normalized.userMessage,
        });

        console.error('[guidance-summary-job] failed:', {
            recordId: payload.recordId,
            code: normalized.code,
            message: normalized.logMessage,
        });

        return {
            status: 'failed' as const,
            reason: normalized.code,
        };
    } finally {
        if (geminiFileName) {
            const deleteClient = ai ?? (() => {
                try {
                    return createGuidanceSummaryClient();
                } catch {
                    return null;
                }
            })();

            if (deleteClient) {
                try {
                    await deleteGuidanceGeminiFile({
                        ai: deleteClient,
                        fileName: geminiFileName,
                    });
                } catch (error) {
                    const normalized = normalizeGuidanceSummaryError(error, 'gemini_upload_failed');
                    console.warn('[guidance-summary-job] failed to delete uploaded file:', {
                        recordId: payload.recordId,
                        fileName: geminiFileName,
                        message: normalized.logMessage,
                    });
                }
            }
        }
    }
}
