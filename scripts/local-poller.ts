
import { checkDriveForNewFiles } from '../src/lib/grading-service';

// Simple poller for local development
async function poll() {
    console.log(`[${new Date().toISOString()}] Polling for new files...`);
    try {
        await checkDriveForNewFiles();
        console.log(`[${new Date().toISOString()}] Check complete.`);
    } finally {
        // Schedule next poll only after current one finishes
        setTimeout(poll, 60 * 1000);
    }
}

console.log("Starting local grading poller (every 60s)...");
poll(); // Initial run
