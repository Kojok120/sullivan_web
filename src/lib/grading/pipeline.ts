import QRCode from 'qrcode';

import { emitRealtimeEvent } from '@/lib/realtime-events';
import { processGamificationUpdates, toGamificationPayload } from '@/lib/gamification-service';
import { claimGradingJob, markGradingJobCompleted, markGradingJobFailed } from '@/lib/grading-job';
import { acquireGradingFileLock, releaseGradingFileLock } from '@/lib/grading-lock';
import { incrementStampCount } from '@/lib/stamp-service';
import { compressProblemIds, expandProblemIds, type QRData } from '@/lib/qr-utils';

import { archiveProcessedFile, getFileName, renameFile } from './drive-ops';
import { gradeWithGemini } from './gemini-grader';
import { downloadAndAnalyzeFile } from './qr';
import { recordGradingResults } from './results';
import { notifyErrorForFile } from './watchdog';

export async function generateQRCode(studentId: string, problemIds: string[], unitToken?: string): Promise<string> {
    const compressed = compressProblemIds(problemIds);

    const data: QRData = {
        s: studentId,
        ...compressed,
        ...(unitToken ? { u: unitToken } : {}),
    };

    const json = JSON.stringify(data);
    return QRCode.toDataURL(json, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 4,
    });
}

export async function processFile(fileId: string, fileName: string) {
    const lockAcquired = await acquireGradingFileLock(fileId);
    if (!lockAcquired) {
        console.log(`[Lock] File ${fileId} is already being processed. Skipping.`);
        return;
    }

    let jobFinalized = false;

    const finalizeFailure = async (message: string) => {
        if (jobFinalized) return;
        jobFinalized = true;
        await markGradingJobFailed(fileId, message);
    };

    const finalizeSuccess = async () => {
        if (jobFinalized) return;
        jobFinalized = true;
        await markGradingJobCompleted(fileId);
    };

    let cleanupFn = async () => {};

    try {
        const claim = await claimGradingJob(fileId, fileName);
        if (!claim.shouldProcess) {
            console.log(`[Idempotency] Skip file ${fileId} (${claim.reason ?? 'unknown'}).`);
            return;
        }

        const currentName = await getFileName(fileId);
        if (currentName?.startsWith('[ERROR]')) {
            console.log(`[Idempotency] Skip file ${fileId}: already marked as error (${currentName}).`);
            await finalizeFailure('File already marked as error');
            return;
        }
        if (currentName?.startsWith('[PROCESSED]')) {
            console.log(`[Idempotency] Skip file ${fileId}: already processed (${currentName}).`);
            await finalizeSuccess();
            return;
        }

        const { destPath, prepared, qrData, studentId, user, cleanup } = await downloadAndAnalyzeFile(fileId, fileName);
        cleanupFn = cleanup;

        if (!qrData) {
            console.error('Failed to extract QR data (Local & AI) from', destPath);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('QR data not found');
            return;
        }

        if (!studentId) {
            console.error('QR data missing student ID for', destPath);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('Student ID not found');
            return;
        }

        const pidsCount = expandProblemIds(qrData).length;
        console.log(`QR Found: Student=...${studentId.slice(-4)}, Problems=${pidsCount}`);

        if (!user) {
            console.error(`User for QR ID ${studentId} not found in DB (checked loginId and id).`);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('User not found');
            return;
        }

        console.log(`Resolved User: ${user.name} (${user.loginId}) -> ${user.id}`);

        try {
            await incrementStampCount(user.id);
            console.log(`[Effort] Incremented stamp count for user ${user.id}.`);
        } catch (error) {
            console.error('[Effort] Failed to update stamp count:', error);
        }

        const results = await gradeWithGemini(prepared, qrData, user.id);
        prepared.base64Data = '';

        const latestName = await getFileName(fileId);
        if (latestName?.startsWith('[ERROR]')) {
            console.warn(`[Process] Skip post-processing ${fileId}: file is marked as error (${latestName}).`);
            await finalizeFailure('File marked as error during processing');
            return;
        }

        if (results && results.length > 0) {
            const gradingSummary = await recordGradingResults(results, qrData);

            try {
                const gamificationResult = await processGamificationUpdates(results[0].studentId, results, {
                    currentGroupId: gradingSummary?.groupId,
                    currentSessionIsPerfect: gradingSummary?.sessionIsPerfect,
                });
                const payload = toGamificationPayload(gamificationResult);
                await emitRealtimeEvent({
                    userId: gamificationResult.userId,
                    type: 'gamification_update',
                    payload,
                });
                console.log(`[Gamification] Updated for user ${results[0].studentId}: +${gamificationResult.xpGained} XP`);
            } catch (error) {
                console.error('[Gamification] Error processing updates:', error);
            }

            const problemIdForContext = results[0].problemId;
            await archiveProcessedFile(fileId, results[0].studentId, problemIdForContext, new Date(), fileName);

            console.log(`Archived file ${fileName}`);
            await finalizeSuccess();
        } else {
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('No grading results');

            if (user) {
                console.log(`Grading failed (no results). Notifying user ${user.id}...`);
                try {
                    await emitRealtimeEvent({
                        userId: user.id,
                        type: 'grading_failed',
                        payload: { fileName },
                    });
                } catch (error) {
                    console.error('[Realtime] Failed to emit grading_failed event:', error);
                }
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing file ${fileId}:`, error);
        await renameFile(fileId, `[ERROR] ${fileName}`);
        await finalizeFailure(message);

        try {
            await notifyErrorForFile(fileId, fileName, 'Processing Error');
        } catch (notifyError) {
            console.error(`Failed to notify for error file ${fileName}:`, notifyError);
        }
    } finally {
        await cleanupFn();
        await releaseGradingFileLock(fileId);
    }
}
