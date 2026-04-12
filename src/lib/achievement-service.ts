import { type Achievement, type UserAchievement } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type UnseenAchievement = UserAchievement & {
    achievement: Achievement;
};

export async function getUnseenAchievementsForUser(userId: string): Promise<UnseenAchievement[]> {
    return prisma.userAchievement.findMany({
        where: {
            userId,
            isSeen: false,
        },
        include: {
            achievement: true,
        },
    });
}
