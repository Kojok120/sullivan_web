
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

// Load env
import * as dotenv from 'dotenv';
dotenv.config();

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

async function main() {
    if (!DRIVE_FOLDER_ID) {
        throw new Error('DRIVE_FOLDER_ID is missing');
    }

    console.log(`Checking Drive Folder: ${DRIVE_FOLDER_ID}`);

    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        // List ALL files in the folder, even processed ones if they weren't moved?
        // Just list everything in parents
        q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime, mimeType)',
        orderBy: 'createdTime desc',
        pageSize: 20,
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
        console.log('No files found.');
    } else {
        console.log('Files found:');
        files.forEach((f) => {
            console.log(`- [${f.createdTime}] ${f.name} (${f.id})`);
        });
    }
}

main().catch(console.error);
