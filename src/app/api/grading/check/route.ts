import { NextResponse } from 'next/server';
import { checkDriveForNewFiles } from '@/lib/grading-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const LOCK_FILE = path.join(os.tmpdir(), 'sullivan_grading.lock');
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
    try {
        // Check for lock
        if (fs.existsSync(LOCK_FILE)) {
            const stats = fs.statSync(LOCK_FILE);
            const now = Date.now();
            if (now - stats.mtimeMs < LOCK_TIMEOUT_MS) {
                console.log('Grading check skipped: Lock file exists and is active.');
                return NextResponse.json({ success: false, message: 'Processing in progress' }, { status: 429 });
            } else {
                console.warn('Grading check: Found stale lock file. Overwriting.');
            }
        }

        // Create lock
        fs.writeFileSync(LOCK_FILE, String(Date.now()));

        try {
            console.log('Triggering drive check...');
            await checkDriveForNewFiles();
            return NextResponse.json({ success: true, message: 'Drive check completed' });
        } finally {
            // Release lock
            if (fs.existsSync(LOCK_FILE)) {
                fs.unlinkSync(LOCK_FILE);
            }
        }
    } catch (error) {
        console.error('Drive check failed:', error);
        // Ensure lock is released even if checkDriveForNewFiles throws
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
