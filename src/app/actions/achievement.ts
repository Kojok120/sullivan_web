'use server';

import { getSession } from '@/lib/auth';
import { getUnseenAchievementsForUser } from '@/lib/achievement-service';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getUnseenAchievements() {
    const session = await getSession();
    if (!session) return [];

    return getUnseenAchievementsForUser(session.userId);
}

export async function markAchievementsAsSeen(ids: string[]) {
    const session = await getSession();
    if (!session) return;

    if (ids.length === 0) return;

    await prisma.userAchievement.updateMany({
        where: {
            id: { in: ids },
            userId: session.userId, // Security check
        },
        data: {
            isSeen: true,
        },
    });

    revalidatePath('/achievements');
}
