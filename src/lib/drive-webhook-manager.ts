import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

function getDrive() {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(`Service account file not found at ${SERVICE_ACCOUNT_PATH}`);
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
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
