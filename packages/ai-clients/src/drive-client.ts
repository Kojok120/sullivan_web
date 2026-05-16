import { google, drive_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

let driveClient: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
    if (driveClient) return driveClient;

    // 1. Try GOOGLE_APPLICATION_CREDENTIALS (Standard Env Var)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log(`[DriveClient] Using GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            console.error(`[DriveClient] ERROR: Credential file does not exist at ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
            // Don't throw yet, try fallback or let GoogleAuth fail naturally
        }
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        return driveClient;
    }

    // 2. Try Local service-account.json (Dev/Fallback)
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.log(`[DriveClient] Using local service-account.json: ${SERVICE_ACCOUNT_PATH}`);
        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        return driveClient;
    }

    // 3. Last Resort: Default GoogleAuth (Environment variables, GCE metadata, etc.)
    console.log('[DriveClient] Attempting default GoogleAuth...');
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        return driveClient;
    } catch (error) {
        console.error('[DriveClient] Failed to initialize Google Drive client:', error);
        throw new Error('Failed to initialize Google Drive client. Check your credentials.');
    }
}
