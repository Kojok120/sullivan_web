import fs from 'fs';
import path from 'path';
import os from 'os';

const LOCK_FILE = path.join(os.tmpdir(), 'sullivan_grading.lock');
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Attempts to acquire the grading lock.
 * @returns true if lock acquired, false if another process is holding it
 */
export async function acquireGradingLock(): Promise<boolean> {
    try {
        await fs.promises.access(LOCK_FILE);
        const stats = await fs.promises.stat(LOCK_FILE);
        if (Date.now() - stats.mtimeMs < LOCK_TIMEOUT_MS) {
            return false; // Lock is active
        }
        console.warn('Grading lock: Found stale lock file. Overwriting.');
        // Stale lock, proceed to overwrite
    } catch {
        // Lock file doesn't exist, proceed
    }
    await fs.promises.writeFile(LOCK_FILE, String(Date.now()));
    return true;
}

/**
 * Releases the grading lock.
 */
export async function releaseGradingLock(): Promise<void> {
    try {
        await fs.promises.unlink(LOCK_FILE);
    } catch {
        // Ignore - lock might not exist
    }
}
