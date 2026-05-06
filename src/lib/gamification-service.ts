import { prisma } from '@/lib/prisma';
import { Achievement, Prisma } from '@prisma/client';

export const XP_PER_LOGIN = 50;
export const XP_PER_ANSWER = 10;
export const XP_BONUS_CORRECT = 5;

// Achievement マスタは seed 由来の静的データなので、採点ごとに findMany を打たず
// プロセス常駐の TTL キャッシュで共有する。
const ACHIEVEMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedAchievements: { promise: Promise<Achievement[]>; expiresAt: number } | null = null;

function getCachedAchievements(): Promise<Achievement[]> {
    const now = Date.now();
    if (!cachedAchievements || cachedAchievements.expiresAt <= now) {
        const promise = prisma.achievement.findMany();
        // 取得失敗時はキャッシュを汚さない
        promise.catch(() => {
            if (cachedAchievements && cachedAchievements.promise === promise) {
                cachedAchievements = null;
            }
        });
        cachedAchievements = {
            promise,
            expiresAt: now + ACHIEVEMENTS_CACHE_TTL_MS,
        };
    }
    return cachedAchievements.promise;
}

export function invalidateAchievementsCache() {
    cachedAchievements = null;
}

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

type GamificationContext = {
    currentGroupId?: string;
    currentSessionIsPerfect?: boolean;
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
    results: { isCorrect: boolean }[],
    context: GamificationContext = {}
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
        const lastStudyDate = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
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

        // 4. Check Achievements (Streak & Solve Count & Perfect & Core Unlock)
        const unlockedAchievements = await checkAchievements(tx, userId, currentStreak, false, context);

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

// `core-unlock-{slugSuffix}` を seed の Subject.name にマッピングする。
// Subject 追加時はここを更新する。
const CORE_UNLOCK_SUBJECT_NAMES: Record<string, string> = {
    english: '英語',
    math: '数学',
    japanese: '国語',
};

type CoreUnlockSubjectStats = { totalCount: number; unlockedCount: number };

// 該当 Subject の (CoreProblem 総数, 当該ユーザーの解放済 CoreProblem 数) を 1 クエリで取得する。
// pendingAchievements が含む subject 分だけ集計する。
async function fetchCoreUnlockStats(
    tx: Prisma.TransactionClient,
    userId: string,
    subjectNames: string[],
): Promise<Map<string, CoreUnlockSubjectStats>> {
    const stats = new Map<string, CoreUnlockSubjectStats>();
    if (subjectNames.length === 0) return stats;

    const rows = await tx.$queryRaw<Array<{ name: string; total_count: number | string | bigint; unlocked_count: number | string | bigint }>>`
        SELECT
            s.name AS name,
            COUNT(DISTINCT cp.id) AS total_count,
            COUNT(DISTINCT ucps."coreProblemId") AS unlocked_count
        FROM "Subject" s
        LEFT JOIN "CoreProblem" cp ON cp."subjectId" = s.id
        LEFT JOIN "UserCoreProblemState" ucps
            ON ucps."coreProblemId" = cp.id
            AND ucps."userId" = ${userId}
            AND ucps."isUnlocked" = true
        WHERE s.name IN (${Prisma.join(subjectNames)})
        GROUP BY s.id, s.name
    `;

    for (const row of rows) {
        stats.set(row.name, {
            totalCount: Number(row.total_count ?? 0),
            unlockedCount: Number(row.unlocked_count ?? 0),
        });
    }
    return stats;
}

// Helper to check achievements
async function checkAchievements(
    tx: Prisma.TransactionClient,
    userId: string,
    currentStreak: number,
    isVideoCheck = false,
    context?: GamificationContext
) {
    const unlockedAchievements: Achievement[] = [];

    // Optimize: Get user's unlocked achievement IDs first
    const userUnlocked = await tx.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true }
    });
    const unlockedIds = new Set(userUnlocked.map((ua) => ua.achievementId));

    // Achievement マスタはトランザクション外の TTL キャッシュから取得する
    const allAchievements = await getCachedAchievements();
    const pendingAchievements = allAchievements.filter((a) => !unlockedIds.has(a.id));

    // core-unlock 系は achievement ごとに COUNT を打たず、関連 Subject を 1 クエリで集計する
    // 未マップ slug は CORE_UNLOCK_SUBJECT_NAMES の更新漏れを示すため、警告ログで気付けるようにする
    const unmappedCoreUnlockSlugs: string[] = [];
    const pendingCoreUnlockSubjectNames = Array.from(
        new Set(
            pendingAchievements
                .filter((a) => a.slug.startsWith('core-unlock-'))
                .map((a) => {
                    const suffix = a.slug.replace('core-unlock-', '');
                    const name = CORE_UNLOCK_SUBJECT_NAMES[suffix];
                    if (!name) {
                        unmappedCoreUnlockSlugs.push(a.slug);
                    }
                    return name;
                })
                .filter((name): name is string => Boolean(name)),
        ),
    );
    if (unmappedCoreUnlockSlugs.length > 0) {
        console.warn(
            `[gamification] core-unlock slug に対応する Subject 名が CORE_UNLOCK_SUBJECT_NAMES に存在しません: ${unmappedCoreUnlockSlugs.join(', ')}`,
        );
    }
    const coreUnlockStats = await fetchCoreUnlockStats(tx, userId, pendingCoreUnlockSubjectNames);

    // Cache some aggregates
    let totalSolvedCount = -1;
    let totalVideoCount = -1;
    let totalReviewCount = -1;
    let totalPerfectCount = -1;

    // Pre-fetch core problem counts if needed for efficiency, or fetch on demand
    // For now, fetch on demand as these achievements are few.

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
                const countResult = await tx.$queryRaw<Array<{ count: number | string | bigint }>>`
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
                totalReviewCount = Number(countResult[0]?.count || 0);
            }
            const target = parseInt(achievement.slug.replace('review-', ''));
            if (!isNaN(target) && totalReviewCount >= target) isUnlocked = true;
        }

        // Perfect Logic
        if (achievement.slug.startsWith('perfect-')) {
            if (totalPerfectCount === -1) {
                if (context?.currentGroupId) {
                    // 現在セッションを除外して集計し、呼び出し元から渡された判定を合算する
                    const countResult = await tx.$queryRaw<Array<{ count: number | string | bigint }>>`
                        SELECT COUNT(*) as count FROM (
                            SELECT lh."groupId"
                            FROM "LearningHistory" lh
                            WHERE
                                lh."userId" = ${userId}
                                AND lh."groupId" IS NOT NULL
                                AND lh."groupId" <> ${context.currentGroupId}
                            GROUP BY lh."groupId"
                            HAVING COUNT(CASE WHEN lh.evaluation IN ('C', 'D') THEN 1 END) = 0
                        ) as perfect_sessions
                    `;
                    totalPerfectCount = Number(countResult[0]?.count || 0)
                        + (context.currentSessionIsPerfect ? 1 : 0);
                } else {
                    // Count sessions (groups) where all answers were correct (no C or D)
                    const countResult = await tx.$queryRaw<Array<{ count: number | string | bigint }>>`
                        SELECT COUNT(*) as count FROM (
                            SELECT lh."groupId"
                            FROM "LearningHistory" lh
                            WHERE lh."userId" = ${userId} AND lh."groupId" IS NOT NULL
                            GROUP BY lh."groupId"
                            HAVING COUNT(CASE WHEN lh.evaluation IN ('C', 'D') THEN 1 END) = 0
                        ) as perfect_sessions
                    `;
                    totalPerfectCount = Number(countResult[0]?.count || 0);
                }
            }

            const target = parseInt(achievement.slug.replace('perfect-', ''));
            if (!isNaN(target) && totalPerfectCount >= target) isUnlocked = true;
        }

        // Core Unlock Logic (Subject Master)
        // 集計は事前 fetch 済み。ここではマップ参照のみ。
        if (achievement.slug.startsWith('core-unlock-')) {
            const slugSuffix = achievement.slug.replace('core-unlock-', '');
            const subjectName = CORE_UNLOCK_SUBJECT_NAMES[slugSuffix];
            if (subjectName) {
                const stats = coreUnlockStats.get(subjectName);
                if (stats && stats.totalCount > 0 && stats.unlockedCount >= stats.totalCount) {
                    isUnlocked = true;
                }
            }
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
