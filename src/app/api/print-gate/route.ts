import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPrintGate } from '@/lib/print-gate-service';

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'STUDENT') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const subjectId = request.nextUrl.searchParams.get('subjectId');
    if (!subjectId) {
        return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
    }

    try {
        const result = await getPrintGate(session.userId, subjectId);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to evaluate print gate:', error);
        return NextResponse.json({ error: 'Failed to evaluate print gate' }, { status: 500 });
    }
}
