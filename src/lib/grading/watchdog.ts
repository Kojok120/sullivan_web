import { isGradingFileLocked } from '@/lib/grading-lock';
import { emitRealtimeEvent } from '@/lib/realtime-events';

import { DRIVE_FOLDER_ID, getDrive } from './context';
import { renameFile } from './drive-ops';
import { downloadAndAnalyzeFile } from './qr';

export async function checkStuckFiles() {
    if (!DRIVE_FOLDER_ID) return;

    try {
        const driveClient = getDrive();
        const timeoutThreshold = new Date(Date.now() - 3 * 60 * 1000);
        const timeStr = timeoutThreshold.toISOString();

        const res = await driveClient.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and createdTime < '${timeStr}' and not name contains '[PROCESSED]' and not name contains '[ERROR]'`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 20,
        });

        const files = res.data.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            const name = file.name || '';
            const id = file.id || '';

            if (!name || name.startsWith('[PROCESSED]') || name.startsWith('[ERROR]')) {
                continue;
            }

            const isLocked = await isGradingFileLocked(id);
            if (isLocked) {
                continue;
            }

            console.log(`Found stuck file (Timeout > 3m): ${name} (${id})`);

            const newName = `[ERROR] (Timeout) ${name}`;
            await renameFile(id, newName);

            try {
                await notifyErrorForFile(id, name, 'Timeout');
            } catch (error) {
                console.error(`Failed to notify for stuck file ${name}:`, error);
            }
        }
    } catch (error) {
        console.error('Error checking stuck files:', error);
    }
}

export async function notifyErrorForFile(fileId: string, fileName: string, reason: string) {
    let cleanupFn = async () => {};
    try {
        const notifyFileName = `notify_${fileName}`;
        const { user, cleanup } = await downloadAndAnalyzeFile(fileId, notifyFileName);
        cleanupFn = cleanup;

        if (user) {
            console.log(`Notifying user ${user.id} of error: ${reason}`);
            await emitRealtimeEvent({
                userId: user.id,
                type: 'grading_failed',
                payload: { fileName, reason },
            });
        }
    } catch (error) {
        console.warn(`Could not extract user for error notification (${fileName}):`, error);
    } finally {
        await cleanupFn();
    }
}
