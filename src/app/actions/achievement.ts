'use server';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getUnseenAchievements() {
    const session = await getSession();
    if (!session) return [];

    const userAchievements = await prisma.userAchievement.findMany({
        where: {
            userId: session.userId,
            isSeen: false,
        },
        include: {
            achievement: true,
        },
    });

    return userAchievements;
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
