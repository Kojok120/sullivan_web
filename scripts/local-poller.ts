
import { checkDriveForNewFiles } from '../src/lib/grading-service';

// Simple poller for local development
async function poll() {
    console.log(`[${new Date().toISOString()}] Polling for new files...`);
    try {
        await checkDriveForNewFiles();
        console.log(`[${new Date().toISOString()}] Check complete.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Check failed:`, error);
    }
}

console.log("Starting local grading poller (every 60s)...");
poll(); // Initial run
setInterval(poll, 60 * 1000); // 60 seconds
