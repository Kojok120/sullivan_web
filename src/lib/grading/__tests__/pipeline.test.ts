import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/grading-lock', () => ({
    acquireGradingFileLock: vi.fn(),
    releaseGradingFileLock: vi.fn(),
}));

vi.mock('@/lib/grading-job', () => ({
    claimGradingJob: vi.fn(),
    markGradingJobCompleted: vi.fn(),
    markGradingJobFailed: vi.fn(),
}));

vi.mock('@/lib/stamp-service', () => ({
    incrementStampCount: vi.fn(),
}));

vi.mock('@/lib/gamification-service', () => ({
    processGamificationUpdates: vi.fn(),
    toGamificationPayload: vi.fn(() => ({})),
}));

vi.mock('@/lib/realtime-events', () => ({
    emitRealtimeEvent: vi.fn(),
}));

vi.mock('@/lib/qr-utils', () => ({
    expandProblemIds: vi.fn(() => ['P1']),
    compressProblemIds: vi.fn(() => ({ p: 'P1' })),
}));

vi.mock('../drive-ops', () => ({
    getFileName: vi.fn(),
    renameFile: vi.fn(),
    archiveProcessedFile: vi.fn(),
}));

vi.mock('../qr', () => ({
    downloadAndAnalyzeFile: vi.fn(),
}));

vi.mock('../gemini-grader', () => ({
    gradeWithGemini: vi.fn(),
}));

vi.mock('../results', () => ({
    recordGradingResults: vi.fn(),
}));

vi.mock('../watchdog', () => ({
    notifyErrorForFile: vi.fn(),
}));

import { claimGradingJob, markGradingJobCompleted, markGradingJobFailed } from '@/lib/grading-job';
import { acquireGradingFileLock, releaseGradingFileLock } from '@/lib/grading-lock';

import { getFileName, renameFile } from '../drive-ops';
import { gradeWithGemini } from '../gemini-grader';
import { processFile } from '../pipeline';
import { downloadAndAnalyzeFile } from '../qr';

const mockedAcquireGradingFileLock = vi.mocked(acquireGradingFileLock);
const mockedReleaseGradingFileLock = vi.mocked(releaseGradingFileLock);
const mockedClaimGradingJob = vi.mocked(claimGradingJob);
const mockedMarkGradingJobCompleted = vi.mocked(markGradingJobCompleted);
const mockedMarkGradingJobFailed = vi.mocked(markGradingJobFailed);
const mockedGetFileName = vi.mocked(getFileName);
const mockedRenameFile = vi.mocked(renameFile);
const mockedDownloadAndAnalyzeFile = vi.mocked(downloadAndAnalyzeFile);
const mockedGradeWithGemini = vi.mocked(gradeWithGemini);

describe('processFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAcquireGradingFileLock.mockResolvedValue(true);
        mockedClaimGradingJob.mockResolvedValue({ shouldProcess: true, reason: undefined });
    });

    it('PROCESSED済みファイルを再処理しない', async () => {
        mockedGetFileName.mockResolvedValue('[PROCESSED] sample.pdf');

        await processFile('f1', 'sample.pdf');

        expect(mockedMarkGradingJobCompleted).toHaveBeenCalledWith('f1');
        expect(mockedDownloadAndAnalyzeFile).not.toHaveBeenCalled();
        expect(mockedReleaseGradingFileLock).toHaveBeenCalledWith('f1');
    });

    it('ERROR済みファイルを再処理しない', async () => {
        mockedGetFileName.mockResolvedValue('[ERROR] sample.pdf');

        await processFile('f1', 'sample.pdf');

        expect(mockedMarkGradingJobFailed).toHaveBeenCalledWith('f1', 'File already marked as error');
        expect(mockedDownloadAndAnalyzeFile).not.toHaveBeenCalled();
        expect(mockedReleaseGradingFileLock).toHaveBeenCalledWith('f1');
    });

    it('QR未検出時にERRORへリネームして失敗記録する', async () => {
        const cleanup = vi.fn().mockResolvedValue(undefined);

        mockedGetFileName.mockResolvedValueOnce('raw.pdf');
        mockedDownloadAndAnalyzeFile.mockResolvedValue({
            destPath: '/tmp/raw.pdf',
            prepared: { base64Data: 'xx', mimeType: 'image/jpeg', isPdfHeader: false },
            qrData: null,
            studentId: null,
            user: null,
            cleanup,
        });

        await processFile('f1', 'raw.pdf');

        expect(mockedRenameFile).toHaveBeenCalledWith('f1', '[ERROR] raw.pdf');
        expect(mockedMarkGradingJobFailed).toHaveBeenCalledWith('f1', 'QR data not found');
        expect(mockedGradeWithGemini).not.toHaveBeenCalled();
        expect(cleanup).toHaveBeenCalled();
        expect(mockedReleaseGradingFileLock).toHaveBeenCalledWith('f1');
    });
});
