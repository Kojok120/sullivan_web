import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getSessionMock,
    canAccessUserWithinClassroomScopeMock,
    createPendingGuidanceSummaryRecordMock,
    failGuidanceSummaryRecordMock,
    publishGuidanceSummaryJobMock,
    uploadPreparedGuidanceAudioMock,
    prepareGuidanceAudioForGeminiMock,
    deleteGuidanceGeminiFileMock,
    normalizeGuidanceSummaryErrorMock,
    prismaMock,
} = vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    canAccessUserWithinClassroomScopeMock: vi.fn(),
    createPendingGuidanceSummaryRecordMock: vi.fn(),
    failGuidanceSummaryRecordMock: vi.fn(),
    publishGuidanceSummaryJobMock: vi.fn(),
    uploadPreparedGuidanceAudioMock: vi.fn(),
    prepareGuidanceAudioForGeminiMock: vi.fn(),
    deleteGuidanceGeminiFileMock: vi.fn(),
    normalizeGuidanceSummaryErrorMock: vi.fn((error: unknown, fallbackCode: string) => ({
        code: fallbackCode,
        userMessage: `message:${fallbackCode}`,
        logMessage: error instanceof Error ? error.message : String(error),
    })),
    prismaMock: {
        user: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@/lib/auth', () => ({
    getSession: getSessionMock,
}));

vi.mock('@/lib/authorization', () => ({
    canAccessUserWithinClassroomScope: canAccessUserWithinClassroomScopeMock,
    isTeacherOrAdminRole: (role: string) => role === 'TEACHER' || role === 'ADMIN' || role === 'HEAD_TEACHER',
}));

vi.mock('@/lib/guidance-summary-job', () => ({
    createPendingGuidanceSummaryRecord: createPendingGuidanceSummaryRecordMock,
    failGuidanceSummaryRecord: failGuidanceSummaryRecordMock,
    publishGuidanceSummaryJob: publishGuidanceSummaryJobMock,
    uploadPreparedGuidanceAudio: uploadPreparedGuidanceAudioMock,
}));

vi.mock('@/lib/guidance-audio-transcoder', () => ({
    prepareGuidanceAudioForGemini: prepareGuidanceAudioForGeminiMock,
}));

vi.mock('@/lib/guidance-summary', () => ({
    deleteGuidanceGeminiFile: deleteGuidanceGeminiFileMock,
    normalizeGuidanceSummaryError: normalizeGuidanceSummaryErrorMock,
}));

vi.mock('@/lib/prisma', () => ({
    prisma: prismaMock,
}));

let POST: typeof import('@/app/api/teacher/students/[userId]/guidance-summary/route').POST;

function createRequest() {
    const formData = new FormData();
    formData.append('audio', new File([Buffer.from('audio')], 'sample.webm', { type: 'audio/webm' }));
    formData.append('startedAtIso', '2026-04-05T00:00:00.000Z');
    formData.append('endedAtIso', '2026-04-05T00:15:00.000Z');
    formData.append('timeZone', 'Asia/Tokyo');

    return new Request('http://localhost/api/teacher/students/student-1/guidance-summary', {
        method: 'POST',
        body: formData,
    }) as unknown as NextRequest;
}

describe('guidance summary route', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        getSessionMock.mockResolvedValue({
            userId: 'teacher-1',
            role: 'TEACHER',
            name: '先生',
            defaultPackId: 'jp-juken',
            allowedPackIds: ['jp-juken'],
        });
        canAccessUserWithinClassroomScopeMock.mockResolvedValue(true);
        prismaMock.user.findUnique.mockResolvedValue({
            id: 'student-1',
            role: 'STUDENT',
        });
        createPendingGuidanceSummaryRecordMock.mockResolvedValue({ id: 'record-1' });
        prepareGuidanceAudioForGeminiMock.mockResolvedValue({
            audioFile: new File([Buffer.from('ogg-audio')], 'sample.ogg', { type: 'audio/ogg' }),
            mimeType: 'audio/ogg',
        });
        uploadPreparedGuidanceAudioMock.mockResolvedValue({
            fileName: 'files/123',
            mimeType: 'audio/ogg',
        });
        publishGuidanceSummaryJobMock.mockResolvedValue(undefined);
        failGuidanceSummaryRecordMock.mockResolvedValue({ updated: true });
        deleteGuidanceGeminiFileMock.mockResolvedValue(undefined);
        ({ POST } = await import('@/app/api/teacher/students/[userId]/guidance-summary/route'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('受理成功時は 202 queued を返す', async () => {
        const response = await POST(createRequest(), {
            params: Promise.resolve({ userId: 'student-1' }),
        });

        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toEqual({
            success: true,
            queued: true,
            recordId: 'record-1',
        });
        expect(publishGuidanceSummaryJobMock).toHaveBeenCalledWith({
            recordId: 'record-1',
            durationMinutes: 15,
            timeZone: 'Asia/Tokyo',
        });
    });

    it('即時失敗時はレコードを FAILED にして 500 を返す', async () => {
        uploadPreparedGuidanceAudioMock.mockRejectedValue(new Error('upload failed'));
        normalizeGuidanceSummaryErrorMock.mockReturnValue({
            code: 'gemini_upload_failed',
            userMessage: 'Gemini への音声アップロードに失敗しました。',
            logMessage: 'upload failed',
        });

        const response = await POST(createRequest(), {
            params: Promise.resolve({ userId: 'student-1' }),
        });

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: 'Gemini への音声アップロードに失敗しました。',
            code: 'gemini_upload_failed',
            recordId: 'record-1',
        });
        expect(failGuidanceSummaryRecordMock).toHaveBeenCalledWith({
            recordId: 'record-1',
            code: 'gemini_upload_failed',
            message: 'Gemini への音声アップロードに失敗しました。',
            notifyTeacher: false,
        });
    });
});
