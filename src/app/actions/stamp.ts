'use server';

import { getSession } from '@/lib/auth';
import {
    getStampDataForUser,
    markStampsAsSeenForUser,
} from '@/lib/stamp-service';
import type { StampData } from '@/lib/stamp-service';

export async function getStampData(): Promise<StampData | null> {
    const session = await getSession();
    if (!session) return null;

    return await getStampDataForUser(session.userId);
}

export async function markStampsAsSeen(newSeenCount: number) {
    const session = await getSession();
    if (!session) return;

    await markStampsAsSeenForUser(session.userId, newSeenCount);
}
