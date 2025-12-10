
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');
const FILE_ID = '1Ysx8HS2u-Z7nxksgZKVYzAKgUCAr089R';
const NEW_NAME = '20251211000453_001.pdf';

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.update({
        fileId: FILE_ID,
        requestBody: { name: NEW_NAME },
    });
    console.log(`Renamed file ${FILE_ID} to ${NEW_NAME}`);
}
main().catch(console.error);
