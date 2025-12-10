import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type StudentStats = {
    totalProblemsSolved: number;
    totalCorrect: number;
    accuracy: number;
    currentStreak: number;
    lastActivity: Date | null;
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
    // 1. Get Aggregates and Distinct Dates in optimized queries
    // We can't easily do distinct count of dates AND total count in one Prisma aggregate.
    // But we can do:
    // 1. Count Total
    // 2. Count Correct
    // 3. Raw query for Dates (for streak)

    // Let's combine 1 & 2 if possible, or use raw for everything.
    // Single Raw Query for Stats:
    const statsRaw = await prisma.$queryRaw<
        Array<{
            total: bigint;
            correct: bigint;
            lastActivity: Date | null;
        }>
    >`
        SELECT 
            COUNT(*) as "total", 
            SUM(CASE WHEN evaluation IN ('A', 'B') THEN 1 ELSE 0 END) as "correct", 
            MAX("answeredAt") as "lastActivity"
        FROM "LearningHistory"
        WHERE "userId" = ${userId}
    `;

    const s = statsRaw[0];
    const totalProblemsSolved = Number(s.total || 0);
    const totalCorrect = Number(s.correct || 0);
    const lastActivity = s.lastActivity;

    // 2. Get Distinct Dates for Streak (Separate query still needed for streak algo, but we used raw earlier)
    const distinctDates = await prisma.$queryRaw<{ date: Date }[]>`
        SELECT DISTINCT DATE("answeredAt") as date
        FROM "LearningHistory"
        WHERE "userId" = ${userId}
        ORDER BY date DESC
    `;

    const uniqueDates = new Set<string>();
    distinctDates.forEach(row => {
        const d = new Date(row.date);
        uniqueDates.add(d.toISOString().split('T')[0]);
    });

    const currentStreak = calculateStreak(uniqueDates);

    return {
        totalProblemsSolved,
        totalCorrect,
        accuracy: totalProblemsSolved > 0 ? Math.round((totalCorrect / totalProblemsSolved) * 100) : 0,
        currentStreak,
        lastActivity: lastActivity || null,
    };
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
    // Bulk fetch stats (Total, Correct, LastActivity) in one query
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
        WHERE "userId" IN (${Prisma.join(studentIds)})
        GROUP BY "userId"
    `;

    const statsMap = new Map<string, StudentStats>();

    // Initialize map
    studentIds.forEach(id => {
        statsMap.set(id, {
            totalProblemsSolved: 0,
            totalCorrect: 0,
            accuracy: 0,
            currentStreak: 0,
            lastActivity: null,
        });
    });

    // Fill data
    // Fill data
    statsRaw.forEach(row => {
        const stats = statsMap.get(row.userId);
        if (stats) {
            stats.totalProblemsSolved = Number(row.total);
            stats.totalCorrect = Number(row.correct || 0);
            stats.lastActivity = row.lastActivity;
        }
    });

    // Calculate accuracy
    // Calculate accuracy and streak
    // Fetch dates for streak calculation
    const allDistinctDates = await prisma.$queryRaw<{ userId: string, date: Date }[]>`
        SELECT "userId", DATE("answeredAt") as date
        FROM "LearningHistory"
        WHERE "userId" IN (${Prisma.join(studentIds)})
        GROUP BY "userId", DATE("answeredAt")
    `;

    const userDatesMap = new Map<string, Set<string>>();
    allDistinctDates.forEach(row => {
        if (!userDatesMap.has(row.userId)) {
            userDatesMap.set(row.userId, new Set());
        }
        const d = new Date(row.date);
        userDatesMap.get(row.userId)!.add(d.toISOString().split('T')[0]);
    });

    statsMap.forEach((stats, userId) => {
        if (stats.totalProblemsSolved > 0) {
            stats.accuracy = Math.round((stats.totalCorrect / stats.totalProblemsSolved) * 100);
        }

        const dates = userDatesMap.get(userId);
        if (dates) {
            stats.currentStreak = calculateStreak(dates);
        }
    });

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

    const rawLogs = await prisma.learningHistory.findMany({
        where: {
            userId,
            answeredAt: {
                gte: startDate,
            },
        },
        select: { answeredAt: true },
    });

    const activityMap = new Map<string, number>();
    rawLogs.forEach(log => {
        const dateStr = log.answeredAt.toISOString().split('T')[0];
        activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
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

function calculateStreak(uniqueDates: Set<string>): number {
    let currentStreak = 0;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Check if streak is active (today or yesterday has activity)
    // Note: timezone handling matches original implementation (using server local time or whatever node uses)
    let checkDate = uniqueDates.has(todayStr) ? today : (uniqueDates.has(yesterdayStr) ? yesterday : null);

    if (checkDate) {
        // Iterate backwards from the active date
        while (true) {
            const dateStr = checkDate!.toISOString().split('T')[0];
            if (uniqueDates.has(dateStr)) {
                currentStreak++;
                checkDate!.setDate(checkDate!.getDate() - 1);
            } else {
                break;
            }
        }
    }
    return currentStreak;
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
    totalProblems: number;
    correctCount: number;
};

// Group history by groupId
export async function getLearningSessions(userId: string, limit = 10): Promise<LearningSession[]> {
    // We can't easily group by groupId and join relations in Prisma (it requires raw SQL or post-processing).
    // Let's use Raw SQL for performance grouping.

    const sessions = await prisma.$queryRaw<Array<{
        groupId: string;
        date: Date;
        subjectName: string;
        total: bigint;
        correct: bigint;
    }>>`
        SELECT 
            lh."groupId",
            MAX(lh."answeredAt") as "date",
            MAX(s.name) as "subjectName",
            COUNT(*) as "total",
            SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) as "correct"
        FROM "LearningHistory" lh
        JOIN "Problem" p ON lh."problemId" = p.id
        -- We join CoreProblem -> Subject.
        -- Problem has many CoreProblems. We pick the first one roughly (MAX/MIN).
        JOIN "_CoreProblemToProblem" cpp ON p.id = cpp."B"
        JOIN "CoreProblem" cp ON cpp."A" = cp.id
        JOIN "Subject" s ON cp."subjectId" = s.id
        WHERE lh."userId" = ${userId} AND lh."groupId" IS NOT NULL
        GROUP BY lh."groupId"
        ORDER BY "date" DESC
        LIMIT ${limit}
    `;

    return sessions.map(s => ({
        groupId: s.groupId,
        date: s.date,
        subjectName: s.subjectName || "不明な教科",
        totalProblems: Number(s.total),
        correctCount: Number(s.correct)
    }));
}

export async function getSessionDetails(groupId: string) {
    return await prisma.learningHistory.findMany({
        where: { groupId },
        include: {
            problem: {
                include: {
                    coreProblems: { include: { subject: true } }
                }
            }
        },
        orderBy: { problem: { order: 'asc' } } // or custom order logic
    });
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
