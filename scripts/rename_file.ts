
import { google } from 'googleapis';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const FILE_ID = '1HklXe9HSy0YY-c7fp-T24mYus2JS0bbi';
const NEW_NAME = '20251212034920_001.jpg'; // Remove [ERROR] prefix
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    console.log(`Renaming file ${FILE_ID} to "${NEW_NAME}"...`);

    await drive.files.update({
        fileId: FILE_ID,
        requestBody: { name: NEW_NAME }
    });

    console.log('Rename complete!');
}

main().catch(console.error);
