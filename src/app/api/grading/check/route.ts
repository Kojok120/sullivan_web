import { NextResponse } from 'next/server';
import { checkDriveForNewFiles } from '@/lib/grading-service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('Triggering drive check...');
        // We await here to ensure it runs, but in a real serverless env with short timeouts, 
        // we might need a different strategy. For local/long-running, this is fine.
        await checkDriveForNewFiles();
        return NextResponse.json({ success: true, message: 'Drive check completed' });
    } catch (error) {
        console.error('Drive check failed:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
