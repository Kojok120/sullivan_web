
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');
const FILE_ID = '1Ysx8HS2u-Z7nxksgZKVYzAKgUCAr089R';
const NEW_NAME = '20251211005414_001.jpg';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID!;

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // 1. Get current parents to remove
    const file = await drive.files.get({ fileId: FILE_ID, fields: 'parents' });
    const previousParents = file.data.parents?.join(',') || '';

    // 2. Move to Root and Rename
    await drive.files.update({
        fileId: FILE_ID,
        addParents: DRIVE_FOLDER_ID,
        removeParents: previousParents,
        requestBody: { name: NEW_NAME },
    });
    console.log(`Reset file ${FILE_ID} to root and renamed to ${NEW_NAME}`);
}
main().catch(console.error);
