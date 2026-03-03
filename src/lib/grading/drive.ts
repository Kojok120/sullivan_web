import { acquireGradingLock, releaseGradingLock } from '@/lib/grading-lock';
import { publishGradingJob } from '@/lib/grading-job';

import { DRIVE_FOLDER_ID, getDrive } from './context';
import { checkStuckFiles } from './watchdog';

export async function secureDriveCheck(reason: string) {
    const lockAcquired = await acquireGradingLock();
    if (!lockAcquired) {
        console.log(`[DriveCheck] Skipped (${reason}): lock active.`);
        return;
    }

    try {
        console.log(`[DriveCheck] Starting (${reason}).`);
        await checkDriveForNewFiles();
    } catch (error) {
        console.error(`[DriveCheck] Failed (${reason}):`, error);
    } finally {
        await releaseGradingLock();
    }
}

export async function checkDriveForNewFiles() {
    if (!DRIVE_FOLDER_ID) {
        console.error('DRIVE_FOLDER_ID is not set');
        return;
    }

    try {
        const driveClient = getDrive();
        const res = await driveClient.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and not name contains '[PROCESSED]' and not name contains '[ERROR]'`,
            fields: 'files(id, name, mimeType, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 10,
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            console.log('No files found.');
            return;
        }

        const filesToProcess = files.filter(
            (file: { id?: string | null; name?: string | null }) =>
                file.id && file.name && !file.name.startsWith('[PROCESSED]') && !file.name.startsWith('[ERROR]'),
        );

        if (filesToProcess.length === 0) {
            console.log('No new files to process.');
            return;
        }

        await Promise.all(
            filesToProcess.map((file: { id?: string | null; name?: string | null }) => {
                console.log(`Queuing grading job for file: ${file.name} (${file.id})`);
                return publishGradingJob(file.id!, file.name!);
            }),
        );
    } catch (error) {
        console.error('Error checking Drive:', error);
    }

    await checkStuckFiles();
}
