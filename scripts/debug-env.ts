
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

console.log('DRIVE_FOLDER_ID:', process.env.DRIVE_FOLDER_ID ? process.env.DRIVE_FOLDER_ID.substring(0, 10) + '...' : 'UNDEFINED');
try {
    const sa = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
    console.log('Service Account Email:', sa.client_email);
} catch (e) {
    console.log('Could not read service-account.json:', e);
}
