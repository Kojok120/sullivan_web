'use server';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export type StampData = {
    totalStamps: number;
    lastSeenStamps: number;
    newStamps: number; // calculated difference
};

export async function getStampData(): Promise<StampData | null> {
    const session = await getSession();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true }
    });

    if (!user) return null;

    // Retrieve metadata safely
    const metadata = (user.metadata as any) || {};
    const stampCard = metadata.stampCard || { totalStamps: 0, lastSeenStamps: 0 };

    // Calculate actual total from LearningHistory if needed, 
    // but for "Effort" we might want to just increment on upload?
    // Let's sync with actual submission count to be robust.
    const actualCount = await prisma.learningHistory.count({
        where: {
            userId: session.userId,
            // We count distinct GroupIDs or individual problems?
            // Stamp per problem or per submission? 
            // Proposal said "Stamp per submission" (effort).
            // But usually history is per problem.
            // Let's count distinct 'groupId' (submission batches).
            groupId: { not: null }
        }
    });

    // If we want to strictly follow "Action of Upload", we might need a separate table.
    // But for now, let's use the actual history count as a proxy for "Approved Effort".
    // Wait, history only exists AFTER grading.
    // The requirement is "Instant Gratification BEFORE grading".
    // So we cannot rely on LearningHistory for the *instant* stamp.
    // We need to increment the counter in metadata *when the client claims 'I submitted'*.
    // OR, we assume the client calls an action "IUploaded" which increments the counter.

    // Let's support both:
    // 1. Client claims "I uploaded" -> Increment totalStamps.
    // 2. We compare totalStamps vs lastSeenStamps.

    return {
        totalStamps: stampCard.totalStamps || 0,
        lastSeenStamps: stampCard.lastSeenStamps || 0,
        newStamps: (stampCard.totalStamps || 0) - (stampCard.lastSeenStamps || 0)
    };
}

export async function claimUploadStamp() {
    const session = await getSession();
    if (!session) return null;

    // Increment total stamps
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true }
    });

    const metadata = (user?.metadata as any) || {};
    const current = metadata.stampCard?.totalStamps || 0;
    const lastSeen = metadata.stampCard?.lastSeenStamps || 0;

    const newTotal = current + 1; // Increment by 1 for this upload action

    await prisma.user.update({
        where: { id: session.userId },
        data: {
            metadata: {
                ...metadata,
                stampCard: {
                    totalStamps: newTotal,
                    lastSeenStamps: lastSeen // Don't update lastSeen yet, animation will do it
                }
            }
        }
    });

    revalidatePath('/dashboard');
    return newTotal;
}

export async function markStampsAsSeen(newSeenCount: number) {
    const session = await getSession();
    if (!session) return;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true }
    });

    const metadata = (user?.metadata as any) || {};
    const stampCard = metadata.stampCard || { totalStamps: 0 };

    // Only update if newSeenCount is greater (don't revert)
    if (newSeenCount > (stampCard.lastSeenStamps || 0)) {
        await prisma.user.update({
            where: { id: session.userId },
            data: {
                metadata: {
                    ...metadata,
                    stampCard: {
                        ...stampCard,
                        lastSeenStamps: newSeenCount
                    }
                }
            }
        });
    }
}
