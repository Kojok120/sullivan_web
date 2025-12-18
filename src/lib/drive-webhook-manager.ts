import { getDriveClient } from '@/lib/drive-client';

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

function getDrive() {
    return getDriveClient();
}

export async function watchDriveFolder(webhookUrl: string): Promise<{ resourceId: string; channelId: string; expiration: string }> {
    if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID is not set");

    const drive = getDrive();
    const channelId = crypto.randomUUID();

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

// TODO: This function is currently not called from application code.
// It should be integrated into:
// 1. A cleanup cron job to stop expired/unused watch channels
// 2. Admin UI to manually stop watching
// Without proper stopWatching calls, Drive watch channels may accumulate.
export async function stopWatching(channelId: string, resourceId: string) {
    const drive = getDrive();
    await drive.channels.stop({
        requestBody: {
            id: channelId,
            resourceId: resourceId
        }
    });
    console.log(`Stopped watching channel ${channelId}`);
}
