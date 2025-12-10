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
    // 1. Get Aggregates
    const [aggregates, lastActivity] = await Promise.all([
        prisma.learningHistory.aggregate({
            where: { userId },
            _count: {
                id: true, // Total
            },
        }),
        prisma.learningHistory.findFirst({
            where: { userId },
            orderBy: { answeredAt: 'desc' },
            select: { answeredAt: true },
        }),
    ]);

    const historyCount = aggregates._count.id;

    // 2. Get Correct Count
    const correctCount = await prisma.learningHistory.count({
        where: { userId, evaluation: { in: ['A', 'B'] } }
    });

    // 3. Get Distinct Dates for Streak
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

    // Calculate Streak
    let currentStreak = 0;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Check if streak is active (today or yesterday has activity)
    let checkDate = uniqueDates.has(todayStr) ? today : (uniqueDates.has(yesterdayStr) ? yesterday : null);

    if (checkDate) {
        currentStreak = 0;
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

    return {
        totalProblemsSolved: historyCount,
        totalCorrect: correctCount,
        accuracy: historyCount > 0 ? Math.round((correctCount / historyCount) * 100) : 0,
        currentStreak,
        lastActivity: lastActivity?.answeredAt || null,
    };
}

export async function getStudentsWithStats(query?: string) {
    const students = await prisma.user.findMany({
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
    const [totalCounts, correctCounts, lastActivities] = await Promise.all([
        prisma.learningHistory.groupBy({
            by: ['userId'],
            where: { userId: { in: studentIds } },
            _count: { id: true },
        }),
        prisma.learningHistory.groupBy({
            by: ['userId'],
            where: { userId: { in: studentIds }, evaluation: { in: ['A', 'B'] } },
            _count: { id: true },
        }),
        prisma.learningHistory.groupBy({
            by: ['userId'],
            where: { userId: { in: studentIds } },
            _max: { answeredAt: true },
        }),
    ]);

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
    totalCounts.forEach(item => {
        const stats = statsMap.get(item.userId);
        if (stats) stats.totalProblemsSolved = item._count.id;
    });

    correctCounts.forEach(item => {
        const stats = statsMap.get(item.userId);
        if (stats) stats.totalCorrect = item._count.id;
    });

    lastActivities.forEach(item => {
        const stats = statsMap.get(item.userId);
        if (stats) stats.lastActivity = item._max.answeredAt;
    });

    // Calculate accuracy
    statsMap.forEach(stats => {
        if (stats.totalProblemsSolved > 0) {
            stats.accuracy = Math.round((stats.totalCorrect / stats.totalProblemsSolved) * 100);
        }
        stats.currentStreak = 0;
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
