'use server';

import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    getStampDataForUser,
    incrementStampCount,
    markStampsAsSeenForUser,
} from '@/lib/stamp-service';
import type { StampData } from '@/lib/stamp-service';

export type { StampData } from '@/lib/stamp-service';

export async function getStampData(): Promise<StampData | null> {
    const session = await getSession();
    if (!session) return null;

    return await getStampDataForUser(session.userId);
}

export async function claimUploadStamp() {
    const session = await getSession();
    if (!session) return null;

    const newTotal = await incrementStampCount(session.userId);
    revalidatePath('/dashboard');
    return newTotal ?? null;
}

export async function markStampsAsSeen(newSeenCount: number) {
    const session = await getSession();
    if (!session) return;

    await markStampsAsSeenForUser(session.userId, newSeenCount);
}
