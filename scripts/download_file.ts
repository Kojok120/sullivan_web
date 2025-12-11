
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const FILE_ID = '1zrOeahZxd6VYWe5YQbii3BJZhVDENfB9';
const DEST_PATH = path.join(process.cwd(), 'tmp', 'debug_image_second.jpg');
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    console.log(`Downloading ${FILE_ID} to ${DEST_PATH}...`);
    const dest = fs.createWriteStream(DEST_PATH);

    const res = await drive.files.get(
        { fileId: FILE_ID, alt: 'media' },
        { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
        res.data
            .on('end', () => {
                console.log('Download complete.');
                resolve(true);
            })
            .on('error', (err) => {
                console.error('Download error:', err);
                reject(err);
            })
            .pipe(dest);
    });
}

main().catch(console.error);
