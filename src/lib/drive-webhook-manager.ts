import { getDriveClient } from '@/lib/drive-client';

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

function getDrive() {
    return getDriveClient();
}

const CHANNEL_ID_MAX_LENGTH = 64;
const FILE_WATCH_DURATION_MS = 24 * 60 * 60 * 1000;

function shouldUseFixedChannelId(): boolean {
    const value = (process.env.DRIVE_WEBHOOK_CHANNEL_ID_FIXED || '').toLowerCase();
    return value === '1' || value === 'true';
}

function buildChannelId(): string {
    const configured = (process.env.DRIVE_WEBHOOK_CHANNEL_ID || '').trim();
    if (!configured) {
        return crypto.randomUUID();
    }

    if (shouldUseFixedChannelId()) {
        return configured.slice(0, CHANNEL_ID_MAX_LENGTH);
    }

    // 既定では固定IDの衝突を避けるため、環境ごとのprefix + ランダムsuffixで発行する。
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const base = configured.replace(/-+$/, '');
    const candidate = `${base}-${suffix}`;
    if (candidate.length <= CHANNEL_ID_MAX_LENGTH) {
        return candidate;
    }
    const available = CHANNEL_ID_MAX_LENGTH - suffix.length - 1;
    return `${base.slice(0, Math.max(1, available))}-${suffix}`;
}

function isChannelIdNotUniqueError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /not unique/i.test(message);
}

async function registerWatch(channelId: string, webhookUrl: string, token?: string) {
    const drive = getDrive();
    const res = await drive.files.watch({
        fileId: DRIVE_FOLDER_ID,
        requestBody: {
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
            token,
            // files.watch の有効期限上限は約24時間。
            expiration: (Date.now() + FILE_WATCH_DURATION_MS).toString()
        }
    });

    console.log('Watch response:', res.data);

    return {
        resourceId: res.data.resourceId!,
        channelId,
        expiration: res.data.expiration!,
        token,
    };
}

export async function watchDriveFolder(webhookUrl: string): Promise<{ resourceId: string; channelId: string; expiration: string; token?: string }> {
    if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID is not set");

    const DRIVE_WEBHOOK_TOKEN = process.env.DRIVE_WEBHOOK_TOKEN || '';

    const token = DRIVE_WEBHOOK_TOKEN || undefined;
    if (!token) {
        console.warn('DRIVE_WEBHOOK_TOKEN is not set; webhook token verification will be skipped.');
    }

    console.log(`Setting up watch for folder ${DRIVE_FOLDER_ID} pointed to ${webhookUrl}`);

    const primaryChannelId = buildChannelId();
    try {
        return await registerWatch(primaryChannelId, webhookUrl, token);
    } catch (error) {
        if (isChannelIdNotUniqueError(error)) {
            const fallbackChannelId = crypto.randomUUID();
            console.warn(`Primary channel ID (${primaryChannelId}) is not unique. Retrying with random channel ID (${fallbackChannelId}).`);
            return registerWatch(fallbackChannelId, webhookUrl, token);
        }
        throw error;
    }
}

// stopWatching is used by the renewal flow to clean up existing channels.

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
