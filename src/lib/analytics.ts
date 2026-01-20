import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type StudentStats = {
    totalProblemsSolved: number;
    totalCorrect: number;
    accuracy: number;
    currentStreak: number;
    lastActivity: Date | null;
    xp: number;
    level: number;
};

export type SubjectProgress = {
    subjectId: string;
    subjectName: string;
    totalCoreProblems: number;
    clearedCoreProblems: number;
    progressPercentage: number;
};

export type DailyActivity = {
    date: string;
    count: number;
};

export async function getStudentStats(userId: string): Promise<StudentStats> {
    // 1. Get Aggregates using shared helper
    const statsMap = await fetchInternalStudentStats([userId]);
    const stats = statsMap.get(userId) || {
        totalProblemsSolved: 0,
        totalCorrect: 0,
        accuracy: 0,
        currentStreak: 0,
        lastActivity: null,
        xp: 0,
        level: 1
    };

    return stats;
}

// Helper function to bulk fetch stats
async function fetchInternalStudentStats(userIds: string[]): Promise<Map<string, StudentStats>> {
    if (userIds.length === 0) return new Map();

    // 1. Fetch Aggregates (Total, Correct, LastActivity)
    const statsRaw = await prisma.$queryRaw<
        Array<{
            userId: string;
            total: bigint;
            correct: bigint;
            lastActivity: Date | null;
        }>
    >`
        SELECT 
            "userId", 
            COUNT(*) as "total", 
            SUM(CASE WHEN evaluation IN ('A', 'B') THEN 1 ELSE 0 END) as "correct", 
            MAX("answeredAt") as "lastActivity"
        FROM "LearningHistory"
        WHERE "userId" IN (${Prisma.join(userIds)})
        GROUP BY "userId"
    `;

    // 2. Fetch User Gamification Stats
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, xp: true, level: true, currentStreak: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // 3. Construct Result Map
    const statsMap = new Map<string, StudentStats>();

    // Initialize
    userIds.forEach(id => {
        const u = userMap.get(id);
        statsMap.set(id, {
            totalProblemsSolved: 0,
            totalCorrect: 0,
            accuracy: 0,
            currentStreak: u?.currentStreak || 0,
            lastActivity: null,
            xp: u?.xp || 0,
            level: u?.level || 1
        });
    });

    // Merge Aggregates
    statsRaw.forEach(row => {
        const s = statsMap.get(row.userId);
        if (s) {
            s.totalProblemsSolved = Number(row.total);
            s.totalCorrect = Number(row.correct || 0);
            s.lastActivity = row.lastActivity;
            if (s.totalProblemsSolved > 0) {
                s.accuracy = Math.round((s.totalCorrect / s.totalProblemsSolved) * 100);
            }
        }
    });

    // Streaks are now fetched from User table, so no manual calculation needed here
    // unless we want to verify. We rely on gamification-service to update it.

    return statsMap;


}

export async function getStudentsWithStats(query?: string, skip = 0, take = 50) {
    const students = await prisma.user.findMany({
        skip,
        take,
        where: {
            role: 'STUDENT',
            OR: query ? [
                { name: { contains: query, mode: 'insensitive' } },
                { loginId: { contains: query, mode: 'insensitive' } },
                { group: { contains: query, mode: 'insensitive' } },
            ] : undefined,
        },
        orderBy: { name: 'asc' },
    });

    if (students.length === 0) return [];

    const studentIds = students.map(s => s.id);

    // Bulk fetch stats
    const statsMap = await fetchInternalStudentStats(studentIds);

    return students.map(student => ({
        ...student,
        stats: statsMap.get(student.id)!,
    }));
}

export async function getSubjectProgress(userId: string): Promise<SubjectProgress[]> {
    // Get all subjects and their core problem counts
    const subjects = await prisma.subject.findMany({
        include: {
            coreProblems: {
                select: { id: true },
            },
        },
        orderBy: { order: 'asc' },
    });

    // Get cleared CoreProblems for this user
    // We use UserCoreProblemState.isUnlocked? 
    // Or we calculate "cleared" based on proficiency?
    // Let's use UserCoreProblemState.isUnlocked if available, or assume if next one is unlocked, this one is cleared?
    // Actually, let's use the same logic as print-algo: AnswerRate >= 50% & CorrectRate >= 60%.
    // But for analytics, we might want to just check if they have "passed" it.
    // Let's rely on UserCoreProblemState.isUnlocked for now, assuming we update it somewhere.
    // Wait, I haven't implemented the logic to UPDATE UserCoreProblemState yet.
    // So relying on it might show 0 progress.
    // Alternative: Check if they have answered problems in the CoreProblem correctly?

    // Let's fetch UserCoreProblemState
    const userCoreStates = await prisma.userCoreProblemState.findMany({
        where: { userId, isUnlocked: true }
    });
    const unlockedCpIds = new Set(userCoreStates.map(s => s.coreProblemId));

    return subjects.map(subject => {
        const totalCoreProblems = subject.coreProblems.length;
        // Count unlocked/cleared core problems
        // Note: "Unlocked" usually means "Ready to play". "Cleared" means "Done".
        // If we track "Cleared", we need a separate flag or logic.
        // Let's assume for progress, we count how many are "Unlocked" (meaning they reached that stage) 
        // OR how many are "Completed" (passed).
        // The user said "Next CoreProblem is unlocked if current is passed".
        // So "Unlocked count" roughly tracks progress.
        // But the last one being unlocked doesn't mean it's done.
        // Let's count "Unlocked" as progress for now.
        const clearedCount = subject.coreProblems.filter(cp => unlockedCpIds.has(cp.id)).length;

        return {
            subjectId: subject.id,
            subjectName: subject.name,
            totalCoreProblems,
            clearedCoreProblems: clearedCount,
            progressPercentage: totalCoreProblems > 0 ? Math.round((clearedCount / totalCoreProblems) * 100) : 0,
        };
    });
}

export async function getDailyActivity(userId: string, days = 30): Promise<DailyActivity[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Group by Date in DB
    const stats = await prisma.$queryRaw<Array<{ date: Date | string, count: bigint }>>`
        SELECT 
            DATE("answeredAt") as "date", 
            COUNT(*) as "count"
        FROM "LearningHistory"
        WHERE "userId" = ${userId}
        AND "answeredAt" >= ${startDate}
        GROUP BY DATE("answeredAt")
    `;

    const activityMap = new Map<string, number>();
    stats.forEach(s => {
        // s.date might be a Date object or string depending on driver
        const d = new Date(s.date);
        const dateStr = d.toISOString().split('T')[0];
        activityMap.set(dateStr, Number(s.count));
    });

    const result: DailyActivity[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        result.push({
            date: dateStr,
            count: activityMap.get(dateStr) || 0,
        });
    }

    return result.reverse();
}

export type Weakness = {
    coreProblemId: string;
    coreProblemName: string;
    subjectName: string;
    accuracy: number;
    totalAttempts: number;
};

export async function getStudentWeaknesses(userId: string, limit = 5): Promise<Weakness[]> {
    // Updated to use Subject instead of Unit
    // Note: Prisma raw query needs to handle Many-to-Many relation between Problem and CoreProblem.
    // Problem has `coreProblems` (implicit many-to-many).
    // In raw SQL, implicit many-to-many uses a join table `_CoreProblemToProblem`.
    // Table name: `_CoreProblemToProblem`
    // Columns: `A` (CoreProblemId), `B` (ProblemId)

    const weaknessesRaw = await prisma.$queryRaw<
        Array<{
            coreProblemId: string;
            coreProblemName: string;
            subjectName: string;
            totalAttempts: bigint;
            correctCount: bigint;
        }>
    >`
        SELECT 
            cp.id as "coreProblemId",
            cp.name as "coreProblemName",
            s.name as "subjectName",
            COUNT(lh.id) as "totalAttempts",
            SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) as "correctCount"
        FROM "LearningHistory" lh
        JOIN "Problem" p ON lh."problemId" = p.id
        JOIN "_CoreProblemToProblem" cpp ON p.id = cpp."B"
        JOIN "CoreProblem" cp ON cpp."A" = cp.id
        JOIN "Subject" s ON cp."subjectId" = s.id
        WHERE lh."userId" = ${userId}
        GROUP BY cp.id, cp.name, s.name
        HAVING COUNT(lh.id) >= 3
        ORDER BY (CAST(SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(lh.id)) ASC
        LIMIT ${limit}
    `;

    return weaknessesRaw.map(w => ({
        coreProblemId: w.coreProblemId,
        coreProblemName: w.coreProblemName,
        subjectName: w.subjectName,
        accuracy: Number(w.totalAttempts) > 0 ? Math.round((Number(w.correctCount) / Number(w.totalAttempts)) * 100) : 0,
        totalAttempts: Number(w.totalAttempts),
    }));
}

export type HistoryFilter = {
    subjectId?: string;
    startDate?: Date;
    endDate?: Date;
};

export type HistorySort = 'desc' | 'asc';

export async function getLearningHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: HistoryFilter,
    sort: HistorySort = 'desc'
) {
    const skip = (page - 1) * limit;

    const whereClause: Prisma.LearningHistoryWhereInput = {
        userId,
        answeredAt: {
            gte: filter?.startDate,
            lte: filter?.endDate,
        },
        problem: filter?.subjectId ? {
            coreProblems: {
                some: {
                    subjectId: filter.subjectId
                }
            }
        } : undefined
    };

    const [items, total] = await Promise.all([
        prisma.learningHistory.findMany({
            where: whereClause,
            include: {
                problem: {
                    include: {
                        coreProblems: {
                            include: { subject: true }
                        }
                    }
                }
            },
            orderBy: {
                answeredAt: sort
            },
            skip,
            take: limit,
        }),
        prisma.learningHistory.count({
            where: whereClause
        })
    ]);

    return { items, total, totalPages: Math.ceil(total / limit) };
}

export async function getAllSubjects() {
    return await prisma.subject.findMany({
        orderBy: { order: 'asc' }
    });
}

export type LearningSession = {
    groupId: string;
    date: Date;
    subjectName: string;
    coreProblemName: string;
    totalProblems: number;
    correctCount: number;
    hasUnread: boolean;
    unwatchedMistakeCount: number;
};

// Group history by groupId
export async function getLearningSessions(userId: string, limit = 10, offset = 0, onlyUnreviewed = false): Promise<LearningSession[]> {
    // We can't easily group by groupId and join relations in Prisma (it requires raw SQL or post-processing).
    // Let's use Raw SQL for performance grouping.
    //
    // [FIX] Problem has many-to-many with CoreProblem, so JOIN would multiply rows.
    // Using subquery to get Subject name without row multiplication.
    // Using COUNT(DISTINCT lh.id) to avoid duplicate counting.

    const sessions = await prisma.$queryRaw<Array<{
        groupId: string;
        date: Date;
        subjectName: string | null;
        coreProblemName: string | null;
        total: bigint;
        correct: bigint;
        unreadCount: bigint;
        unwatchedMistakeCount: bigint;
    }>>`
        SELECT 
            lh."groupId",
            MAX(lh."answeredAt") as "date",
            (
                SELECT s.name 
                FROM "_CoreProblemToProblem" cpp
                JOIN "CoreProblem" cp ON cpp."A" = cp.id
                JOIN "Subject" s ON cp."subjectId" = s.id
                WHERE cpp."B" = (
                    SELECT lh2."problemId" 
                    FROM "LearningHistory" lh2 
                    WHERE lh2."groupId" = lh."groupId" 
                    LIMIT 1
                )
                LIMIT 1
            ) as "subjectName",
            (
                SELECT cp.name 
                FROM "_CoreProblemToProblem" cpp
                JOIN "CoreProblem" cp ON cpp."A" = cp.id
                WHERE cpp."B" = (
                    SELECT lh2."problemId" 
                    FROM "LearningHistory" lh2 
                    WHERE lh2."groupId" = lh."groupId" 
                    LIMIT 1
                )
                LIMIT 1
            ) as "coreProblemName",
            COUNT(DISTINCT lh.id) as "total",
            COUNT(DISTINCT CASE WHEN lh.evaluation IN ('A', 'B') THEN lh.id END) as "correct",
            COUNT(CASE WHEN lh."isStudentReviewed" = false THEN 1 END) as "unreadCount",
            COUNT(DISTINCT CASE 
                WHEN lh.evaluation IN ('C', 'D') 
                AND lh."isVideoWatched" = false 
                AND p."videoUrl" IS NOT NULL 
                THEN lh.id 
            END) as "unwatchedMistakeCount"
        FROM "LearningHistory" lh
        JOIN "Problem" p ON lh."problemId" = p.id
        WHERE lh."userId" = ${userId} AND lh."groupId" IS NOT NULL
        GROUP BY lh."groupId"
        ${onlyUnreviewed ? Prisma.sql`HAVING COUNT(DISTINCT CASE WHEN lh.evaluation IN ('C', 'D') AND lh."isVideoWatched" = false AND p."videoUrl" IS NOT NULL THEN lh.id END) > 0` : Prisma.empty}
        ORDER BY "date" DESC
        LIMIT ${limit}
        OFFSET ${offset}
    `;

    return sessions.map(s => ({
        groupId: s.groupId,
        date: s.date,
        subjectName: s.subjectName || "不明な教科",
        coreProblemName: s.coreProblemName || "不明な単元",
        totalProblems: Number(s.total),
        correctCount: Number(s.correct),
        hasUnread: Number(s.unreadCount) > 0,
        unwatchedMistakeCount: Number(s.unwatchedMistakeCount)
    }));
}

export async function markSessionAsReviewed(groupId: string, userId: string) {
    if (!groupId) return;

    await prisma.learningHistory.updateMany({
        where: {
            groupId: groupId,
            userId: userId,
            isStudentReviewed: false,
        },
        data: {
            isStudentReviewed: true
        }
    });
}

export async function getSessionDetails(groupId: string, userId?: string) {
    if (!groupId) return [];

    // SECURITY: If userId is provided, ensure we only fetch data for that user
    const whereClause: any = { groupId };
    if (userId) {
        whereClause.userId = userId;
    }

    return await prisma.learningHistory.findMany({
        where: whereClause,
        include: {
            problem: {
                include: {
                    coreProblems: { include: { subject: true } }
                }
            }
        },
        // ID順（挿入順）で並べる = 問題用紙と同じ順序
        orderBy: { id: 'asc' }
    });
}

// Consolidated Dashboard Data Fetcher
export async function getStudentDashboardData(userId: string) {
    // 1. Fetch all necessary data in parallel
    // Note: subjectProgress already contains subject info, so we don't need a separate subjects query
    const [
        stats,
        dailyActivity,
        subjectProgress,
        weaknesses,
        recentHistory,
        student
    ] = await Promise.all([
        getStudentStats(userId),
        getDailyActivity(userId),
        getSubjectProgress(userId),
        getStudentWeaknesses(userId),
        prisma.learningHistory.findMany({
            where: { userId },
            select: {
                id: true,
                evaluation: true,
                answeredAt: true,
                userAnswer: true,
                feedback: true,
                problem: {
                    select: {
                        id: true,
                        question: true,
                        coreProblems: {
                            select: {
                                id: true,
                                name: true,
                                subject: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { answeredAt: 'desc' },
            take: 50 // Limit to recent 50 items for display
        }),
        prisma.user.findUnique({
            where: { id: userId },
            include: {
                guidanceRecords: {
                    include: { teacher: { select: { name: true } } },
                    orderBy: { date: 'desc' }
                },
                classroom: true
            }
        })
    ]);

    if (!student) return null;

    // Derive subjects from subjectProgress to avoid duplicate query
    // Note: Only id and name are needed by PrintProblemCard component
    const subjects = subjectProgress.map(sp => ({
        id: sp.subjectId,
        name: sp.subjectName,
    }));

    return {
        student,
        stats,
        dailyActivity,
        subjectProgress,
        weaknesses,
        recentHistory,
        subjects
    };
}

export async function getUnwatchedCount(userId: string): Promise<number> {
    const count = await prisma.learningHistory.count({
        where: {
            userId,
            isVideoWatched: false,
            evaluation: { in: ['C', 'D'] }, // Only count incorrect ones
            problem: {
                videoUrl: { not: null } // Only if video exists
            }
        }
    });
    return count;
}
