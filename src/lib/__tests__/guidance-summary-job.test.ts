import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    prismaMock,
    emitRealtimeEventMock,
    enqueueCloudTaskMock,
    uploadGuidanceAudioFileToGeminiMock,
    waitForGeminiFileActiveMock,
    generateInterviewSummaryFromGeminiFileMock,
    deleteGuidanceGeminiFileMock,
    createGuidanceSummaryClientMock,
    buildInterviewSummaryPromptMock,
    normalizeGuidanceSummaryErrorMock,
    GuidanceSummaryErrorMock,
} = vi.hoisted(() => {
    class GuidanceSummaryErrorMock extends Error {
        code: string;
        displayMessage: string;

        constructor(code: string, detail?: string, displayMessage?: string) {
            super(detail ?? displayMessage ?? code);
            this.code = code;
            this.displayMessage = displayMessage ?? `message:${code}`;
        }
    }

    return {
        prismaMock: {
            guidanceRecord: {
                create: vi.fn(),
                findUnique: vi.fn(),
                updateMany: vi.fn(),
            },
        },
        emitRealtimeEventMock: vi.fn(),
        enqueueCloudTaskMock: vi.fn(),
        uploadGuidanceAudioFileToGeminiMock: vi.fn(),
        waitForGeminiFileActiveMock: vi.fn(),
        generateInterviewSummaryFromGeminiFileMock: vi.fn(),
        deleteGuidanceGeminiFileMock: vi.fn(),
        createGuidanceSummaryClientMock: vi.fn(() => ({ files: { get: vi.fn(), delete: vi.fn() } })),
        buildInterviewSummaryPromptMock: vi.fn(() => 'prompt'),
        normalizeGuidanceSummaryErrorMock: vi.fn((error: unknown, fallbackCode: string) => ({
            code: typeof error === 'object' && error !== null && 'code' in error ? error.code : fallbackCode,
            userMessage: typeof error === 'object' && error !== null && 'displayMessage' in error
                ? error.displayMessage
                : `message:${fallbackCode}`,
            logMessage: error instanceof Error ? error.message : String(error),
        })),
        GuidanceSummaryErrorMock,
    };
});

vi.mock('@/lib/prisma', () => ({
    prisma: prismaMock,
}));

vi.mock('@/lib/realtime-events', () => ({
    emitRealtimeEvent: emitRealtimeEventMock,
}));

vi.mock('@/lib/cloud-tasks', () => ({
    DEFAULT_GUIDANCE_SUMMARY_TASK_QUEUE: 'sullivan-guidance-summary',
    enqueueCloudTask: enqueueCloudTaskMock,
}));

vi.mock('@/lib/guidance-summary', () => ({
    buildInterviewSummaryPrompt: buildInterviewSummaryPromptMock,
    createGuidanceSummaryClient: createGuidanceSummaryClientMock,
    deleteGuidanceGeminiFile: deleteGuidanceGeminiFileMock,
    generateInterviewSummaryFromGeminiFile: generateInterviewSummaryFromGeminiFileMock,
    getGuidanceSummaryErrorMessage: (code: string) => `message:${code}`,
    GuidanceSummaryError: GuidanceSummaryErrorMock,
    normalizeGuidanceSummaryError: normalizeGuidanceSummaryErrorMock,
    uploadGuidanceAudioFileToGemini: uploadGuidanceAudioFileToGeminiMock,
    waitForGeminiFileActive: waitForGeminiFileActiveMock,
}));

import {
    completeGuidanceSummaryRecord,
    failGuidanceSummaryRecord,
    processGuidanceSummaryJob,
    publishGuidanceSummaryJob,
    uploadPreparedGuidanceAudio,
} from '@/lib/guidance-summary-job';

describe('guidance-summary-job', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('guidance summary 用 Cloud Tasks を発行する', async () => {
        await publishGuidanceSummaryJob({
            recordId: 'record-1',
            durationMinutes: 12,
            timeZone: 'Asia/Tokyo',
        });

        expect(enqueueCloudTaskMock).toHaveBeenCalledWith({
            queue: 'sullivan-guidance-summary',
            path: '/api/queue/guidance-summary',
            payload: {
                recordId: 'record-1',
                durationMinutes: 12,
                timeZone: 'Asia/Tokyo',
            },
        });
    });

    it('アップロード済み音声ファイル名を GuidanceRecord に紐付ける', async () => {
        uploadGuidanceAudioFileToGeminiMock.mockResolvedValue({
            fileName: 'files/123',
            mimeType: 'audio/ogg',
        });
        prismaMock.guidanceRecord.updateMany.mockResolvedValue({ count: 1 });

        const file = new File([Buffer.from('audio')], 'audio.ogg', { type: 'audio/ogg' });
        await expect(uploadPreparedGuidanceAudio({
            recordId: 'record-1',
            audioFile: file,
        })).resolves.toEqual({
            fileName: 'files/123',
            mimeType: 'audio/ogg',
        });

        expect(prismaMock.guidanceRecord.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'record-1',
                status: 'PENDING',
            },
            data: {
                geminiFileName: 'files/123',
                summaryErrorCode: null,
                summaryErrorMessage: null,
            },
        });
    });

    it('完了時は record を COMPLETED に更新して講師へ通知する', async () => {
        prismaMock.guidanceRecord.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        prismaMock.guidanceRecord.findUnique
            .mockResolvedValueOnce({
                id: 'record-1',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                date: new Date('2026-04-05T00:00:00.000Z'),
                status: 'PROCESSING',
                geminiFileName: 'files/123',
                summaryJobAttempts: 1,
                student: { name: '山田太郎', loginId: 'student001' },
                teacher: { name: '佐藤先生', loginId: 'teacher001' },
            })
            .mockResolvedValueOnce({
                teacherId: 'teacher-1',
                studentId: 'student-1',
            });
        waitForGeminiFileActiveMock.mockResolvedValue({
            fileName: 'files/123',
            fileUri: 'gs://files/123',
        });
        generateInterviewSummaryFromGeminiFileMock.mockResolvedValue({
            summary: '学習計画を見直した。',
            topics: ['学習時間'],
            currentStatus: ['学習時間が不足している'],
            concerns: ['宿題の着手が遅い'],
            agreements: ['開始時刻を固定する'],
            nextActions: ['生徒: 毎日19時に学習を始める'],
            followUpPoints: ['次回面談で実施率を確認する'],
        });

        await expect(processGuidanceSummaryJob({
            recordId: 'record-1',
            durationMinutes: 15,
            timeZone: 'Asia/Tokyo',
        })).resolves.toEqual({
            status: 'completed',
            reason: undefined,
        });

        expect(prismaMock.guidanceRecord.updateMany).toHaveBeenNthCalledWith(1, {
            where: {
                id: 'record-1',
                status: 'PENDING',
            },
            data: {
                status: 'PROCESSING',
                summaryJobAttempts: { increment: 1 },
                summaryErrorCode: null,
                summaryErrorMessage: null,
            },
        });
        expect(prismaMock.guidanceRecord.updateMany).toHaveBeenNthCalledWith(2, {
            where: { id: 'record-1' },
            data: {
                status: 'COMPLETED',
                content: expect.stringContaining('面談要約'),
                summaryErrorCode: null,
                summaryErrorMessage: null,
                geminiFileName: null,
            },
        });
        expect(emitRealtimeEventMock).toHaveBeenCalledWith({
            userId: 'teacher-1',
            type: 'guidance_summary_completed',
            payload: {
                recordId: 'record-1',
                studentId: 'student-1',
                message: null,
            },
        });
        expect(deleteGuidanceGeminiFileMock).toHaveBeenCalledWith({
            ai: expect.any(Object),
            fileName: 'files/123',
        });
    });

    it('失敗時は record を FAILED に更新して講師へ通知する', async () => {
        prismaMock.guidanceRecord.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        prismaMock.guidanceRecord.findUnique
            .mockResolvedValueOnce({
                id: 'record-1',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                date: new Date('2026-04-05T00:00:00.000Z'),
                status: 'PROCESSING',
                geminiFileName: null,
                summaryJobAttempts: 1,
                student: { name: '山田太郎', loginId: 'student001' },
                teacher: { name: '佐藤先生', loginId: 'teacher001' },
            })
            .mockResolvedValueOnce({
                teacherId: 'teacher-1',
                studentId: 'student-1',
            });

        await expect(processGuidanceSummaryJob({
            recordId: 'record-1',
            durationMinutes: null,
            timeZone: 'Asia/Tokyo',
        })).resolves.toEqual({
            status: 'failed',
            reason: 'guidance_record_missing_file',
        });

        expect(prismaMock.guidanceRecord.updateMany).toHaveBeenNthCalledWith(2, {
            where: { id: 'record-1' },
            data: {
                status: 'FAILED',
                summaryErrorCode: 'guidance_record_missing_file',
                summaryErrorMessage: 'message:guidance_record_missing_file',
                geminiFileName: null,
            },
        });
        expect(emitRealtimeEventMock).toHaveBeenCalledWith({
            userId: 'teacher-1',
            type: 'guidance_summary_failed',
            payload: {
                recordId: 'record-1',
                studentId: 'student-1',
                message: 'message:guidance_record_missing_file',
            },
        });
    });

    it('明示的な完了更新でも講師へ通知する', async () => {
        prismaMock.guidanceRecord.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.guidanceRecord.findUnique.mockResolvedValue({
            teacherId: 'teacher-1',
            studentId: 'student-1',
        });

        await expect(completeGuidanceSummaryRecord({
            recordId: 'record-1',
            content: '面談要約\n要点',
        })).resolves.toEqual({ updated: true });

        expect(emitRealtimeEventMock).toHaveBeenCalledWith({
            userId: 'teacher-1',
            type: 'guidance_summary_completed',
            payload: {
                recordId: 'record-1',
                studentId: 'student-1',
                message: null,
            },
        });
    });

    it('明示的な失敗更新でも講師へ通知する', async () => {
        prismaMock.guidanceRecord.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.guidanceRecord.findUnique.mockResolvedValue({
            teacherId: 'teacher-1',
            studentId: 'student-1',
        });

        await expect(failGuidanceSummaryRecord({
            recordId: 'record-1',
            code: 'gemini_generate_failed',
            message: 'AI 要約の生成に失敗しました。',
        })).resolves.toEqual({
            updated: true,
            summaryErrorMessage: 'AI 要約の生成に失敗しました。',
        });

        expect(emitRealtimeEventMock).toHaveBeenCalledWith({
            userId: 'teacher-1',
            type: 'guidance_summary_failed',
            payload: {
                recordId: 'record-1',
                studentId: 'student-1',
                message: 'AI 要約の生成に失敗しました。',
            },
        });
    });
});
