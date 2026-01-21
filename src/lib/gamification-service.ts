import { prisma } from '@/lib/prisma';
import { User, Achievement } from '@prisma/client';

export const XP_PER_LOGIN = 50;
export const XP_PER_ANSWER = 10;
export const XP_BONUS_CORRECT = 5;

// Level calculation constant
const LEVEL_CONSTANT = 0.1;

export function calculateLevel(xp: number): number {
    return Math.floor(LEVEL_CONSTANT * Math.sqrt(xp)) || 1;
}

export type GamificationUpdateResult = {
    userId: string;
    xpGained?: number; // Optional as video watch might not give XP directly, but achievement gives XP
    levelUp?: {
        oldLevel: number;
        newLevel: number;
    } | null;
    streakUpdated?: boolean;
    achievementsUnlocked: Achievement[];
};

export function toGamificationPayload(result: GamificationUpdateResult) {
    return {
        userId: result.userId,
        xpGained: result.xpGained ?? 0,
        levelUp: result.levelUp ?? null,
        streakUpdated: result.streakUpdated ?? false,
        achievementsUnlocked: result.achievementsUnlocked.map((a) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            description: a.description,
            icon: a.icon,
            xpReward: a.xpReward,
            isHidden: a.isHidden,
        })),
    };
}

/**
 * Main entry point to update gamification stats after a grading batch.
 */
export async function processGamificationUpdates(
    userId: string,
    results: { isCorrect: boolean }[]
): Promise<GamificationUpdateResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalXpGained = 0;

    // 1. Calculate Answer XP
    for (const result of results) {
        totalXpGained += XP_PER_ANSWER;
        if (result.isCorrect) {
            totalXpGained += XP_BONUS_CORRECT;
        }
    }

    // Transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

        // 2. Update Streak & Daily Summary
        let streakUpdated = false;
        let currentStreak = user.currentStreak;
        let lastStudyDate = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
        if (lastStudyDate) lastStudyDate.setHours(0, 0, 0, 0);

        // a. Daily Summary (Heatmap)
        await tx.dailyLearningSummary.upsert({
            where: { userId_date: { userId, date: today } },
            create: { userId, date: today, count: results.length },
            update: { count: { increment: results.length } }
        });

        // b. Streak Logic
        // If last study date is NOT today, update streak
        if (!lastStudyDate || lastStudyDate.getTime() < today.getTime()) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (lastStudyDate && lastStudyDate.getTime() === yesterday.getTime()) {
                // Continued streak
                currentStreak += 1;
            } else {
                // Broken streak or first time (if lastStudyDate was older than yesterday)
                // Exception: if lastStudyDate is null (first ever), it becomes 1.
                currentStreak = 1;
            }

            // Only update lastStudyDate if it's a new day
            streakUpdated = true;
        }

        const maxStreak = Math.max(user.maxStreak, currentStreak);

        // 3. Update User (XP, Level, Streak)
        const newXp = user.xp + totalXpGained;
        const oldLevel = user.level;
        const newLevel = calculateLevel(newXp);

        await tx.user.update({
            where: { id: userId },
            data: {
                xp: newXp,
                level: newLevel,
                currentStreak,
                maxStreak,
                lastStudyDate: today // Always set to today
            }
        });

        // 4. Check Achievements (Streak & Solve Count)
        const unlockedAchievements = await checkAchievements(tx, userId, currentStreak);

        // Add Achievement XP
        let achievementXp = 0;
        for (const achievement of unlockedAchievements) {
            achievementXp += achievement.xpReward;
        }

        if (achievementXp > 0) {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { xp: { increment: achievementXp } }
            });
            // Re-check level after achievement XP
            const finalLevel = calculateLevel(updatedUser.xp);
            if (finalLevel > newLevel) {
                // Level up from achievement!
                // Update the local var to reflect this
                // But wait, we already returned based on 'newLevel' and 'oldLevel'
                // Simpler to just process the level update here if needed.
                if (finalLevel > newLevel) {
                    await tx.user.update({ where: { id: userId }, data: { level: finalLevel } });
                }
            }
        }

        return {
            userId,
            xpGained: totalXpGained + achievementXp,
            levelUp: calculateLevel(newXp + achievementXp) > oldLevel ? { oldLevel, newLevel: calculateLevel(newXp + achievementXp) } : null,
            streakUpdated,
            achievementsUnlocked: unlockedAchievements
        };
    });

    return result;
}

/**
 * Handle video watch gamification
 */
export async function processVideoWatch(userId: string): Promise<GamificationUpdateResult> {
    return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

        // Check Video Achievements
        const unlockedAchievements = await checkAchievements(tx, userId, user.currentStreak, true);

        // Add Achievement XP
        let achievementXp = 0;
        for (const achievement of unlockedAchievements) {
            achievementXp += achievement.xpReward;
        }

        let levelUp = null;
        if (achievementXp > 0) {
            const newXp = user.xp + achievementXp;
            const newLevel = calculateLevel(newXp);

            await tx.user.update({
                where: { id: userId },
                data: {
                    xp: newXp,
                    level: newLevel
                }
            });

            if (newLevel > user.level) {
                levelUp = { oldLevel: user.level, newLevel };
            }
        }

        return {
            userId,
            xpGained: achievementXp, // Only XP from achievements
            levelUp,
            achievementsUnlocked: unlockedAchievements
        };
    });
}

// Helper to check achievements
async function checkAchievements(tx: any, userId: string, currentStreak: number, isVideoCheck = false) {
    const unlockedAchievements: Achievement[] = [];

    // Optimize: Get user's unlocked achievement IDs first
    const userUnlocked = await tx.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true }
    });
    const unlockedIds = new Set(userUnlocked.map((ua: any) => ua.achievementId));

    const allAchievements = await tx.achievement.findMany();
    const pendingAchievements = allAchievements.filter((a: any) => !unlockedIds.has(a.id));

    // Cache some aggregates
    let totalSolvedCount = -1;
    let totalVideoCount = -1;
    let totalReviewCount = -1;

    for (const achievement of pendingAchievements) {
        let isUnlocked = false;

        // Streak Logic
        if (achievement.slug.startsWith('streak-')) {
            const target = parseInt(achievement.slug.replace('streak-', ''));
            if (!isNaN(target) && currentStreak >= target) isUnlocked = true;
        }

        // Solve Logic
        if (achievement.slug.startsWith('solve-')) {
            if (totalSolvedCount === -1) {
                const totalSolved = await tx.dailyLearningSummary.aggregate({
                    where: { userId },
                    _sum: { count: true }
                });
                totalSolvedCount = totalSolved._sum.count || 0;
            }
            const target = parseInt(achievement.slug.replace('solve-', ''));
            if (!isNaN(target) && totalSolvedCount >= target) isUnlocked = true;
        }

        // Video Logic
        if (isVideoCheck && achievement.slug.startsWith('video-')) {
            if (totalVideoCount === -1) {
                totalVideoCount = await tx.learningHistory.count({
                    where: { userId, isVideoWatched: true }
                });
            }
            const target = parseInt(achievement.slug.replace('video-', ''));
            if (!isNaN(target) && totalVideoCount >= target) isUnlocked = true;
        }

        // Review Completion Logic (Perfect or Reviewed Mistakes)
        if (achievement.slug.startsWith('review-')) {
            if (totalReviewCount === -1) {
                // Count sessions where (Mistakes > 0 AND UnwatchedMistakes == 0) OR (Mistakes == 0)
                // Effectively: Sessions where UnwatchedMistakes == 0
                // Note: We need to filter by groupId is not null to ensure it's a valid session.
                const countResult = await tx.$queryRaw`
                    SELECT COUNT(*) as count FROM (
                        SELECT lh."groupId"
                        FROM "LearningHistory" lh
                        LEFT JOIN "Problem" p ON lh."problemId" = p.id
                        WHERE lh."userId" = ${userId} AND lh."groupId" IS NOT NULL
                        GROUP BY lh."groupId"
                        HAVING 
                            COUNT(CASE WHEN lh.evaluation IN ('C', 'D') THEN 1 END) > 0
                            AND
                            COUNT(CASE 
                                WHEN lh.evaluation IN ('C', 'D') 
                                AND lh."isVideoWatched" = false 
                                AND p."videoUrl" IS NOT NULL 
                                AND p."videoUrl" != ''
                                THEN 1 
                            END) = 0
                    ) as completed_sessions
                `;
                // Type assertion for raw query result
                totalReviewCount = Number((countResult as any)[0]?.count || 0);
            }
            const target = parseInt(achievement.slug.replace('review-', ''));
            if (!isNaN(target) && totalReviewCount >= target) isUnlocked = true;
        }

        if (isUnlocked) {
            await tx.userAchievement.create({
                data: { userId, achievementId: achievement.id }
            });
            unlockedAchievements.push(achievement);
        }
    }
    return unlockedAchievements;
}
