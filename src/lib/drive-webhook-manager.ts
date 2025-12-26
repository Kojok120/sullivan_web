import { getDriveClient } from '@/lib/drive-client';

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

function getDrive() {
    return getDriveClient();
}

export async function watchDriveFolder(webhookUrl: string): Promise<{ resourceId: string; channelId: string; expiration: string }> {
    if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID is not set");

    const DRIVE_WEBHOOK_CHANNEL_ID = process.env.DRIVE_WEBHOOK_CHANNEL_ID || '';

    const drive = getDrive();
    const channelId = DRIVE_WEBHOOK_CHANNEL_ID || crypto.randomUUID();

    console.log(`Setting up watch for folder ${DRIVE_FOLDER_ID} pointed to ${webhookUrl}`);

    const res = await drive.files.watch({
        fileId: DRIVE_FOLDER_ID,
        requestBody: {
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
            // expiration: (Date.now() + 86400000).toString() // Optional: 1 day, default varies
        }
    });

    console.log("Watch response:", res.data);

    return {
        resourceId: res.data.resourceId!,
        channelId: channelId,
        expiration: res.data.expiration!,
    };
}

// stopWatching removed as it was unused.
// If needed for cleanup cron jobs in future, implement using Google Drive API directly.

export async function stopWatching(channelId: string, resourceId: string): Promise<void> {
    const drive = getDrive();
    await drive.channels.stop({
        requestBody: {
            id: channelId,
            resourceId: resourceId,
        }
    });
    console.log(`Stopped watching channel: ${channelId}`);
}

