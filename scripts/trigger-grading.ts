
import { checkDriveForNewFiles } from '../src/lib/grading-service';
import * as dotenv from 'dotenv';
dotenv.config();

console.log('--- Starting Manual Grading Trigger ---');
async function main() {
    try {
        await checkDriveForNewFiles();
        console.log('--- Finished Manual Grading Trigger ---');
    } catch (error) {
        console.error('--- Error in Grading Trigger ---', error);
    }
}
main();
