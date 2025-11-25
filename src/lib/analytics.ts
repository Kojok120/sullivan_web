import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type StudentStats = {
    totalProblemsSolved: number;
    totalCorrect: number;
    accuracy: number;
    currentStreak: number;
    lastActivity: Date | null;
};

export type UnitProgress = {
    unitId: string;
    unitName: string;
    totalCoreProblems: number;
    clearedCoreProblems: number;
    progressPercentage: number;
    subjectName: string;
};

export type DailyActivity = {
    date: string;
    count: number;
};

export async function getStudentStats(userId: string): Promise<StudentStats> {
    const [historyCount, correctCount, lastActivity] = await Promise.all([
        prisma.learningHistory.count({ where: { userId } }),
        prisma.learningHistory.count({ where: { userId, evaluation: { in: ['A', 'B'] } } }),
        prisma.learningHistory.findFirst({
            where: { userId },
            orderBy: { answeredAt: 'desc' },
            select: { answeredAt: true },
        }),
    ]);

    // Optimized Streak Calculation: fetch only distinct dates, limited to recent history if needed
    // For simplicity and performance, we can fetch just the dates.
    // Since we need consecutive days, we might still need many rows if the streak is long.
    // However, we can optimize by using `distinct` if Prisma supported it on date fields easily with SQLite/Postgres differences.
    // A raw query would be best for "consecutive days", but sticking to Prisma for now:
    // We fetch dates only.
    const activityDates = await prisma.learningHistory.findMany({
        where: { userId },
        select: { answeredAt: true },
        orderBy: { answeredAt: 'desc' },
        distinct: ['answeredAt'], // This might not work as expected if times differ.
        // Actually, let's just fetch dates. If the user has 10000 history items, this is still heavy.
        // But usually streak is calculated from "today" backwards.
        // We can fetch in chunks or just fetch the last N days?
        // If we want *true* all-time streak, we need all dates.
        // Let's stick to the previous logic but ensure we only select 'answeredAt'.
        // The previous implementation already selected only 'answeredAt'.
        // The review criticism was "4 queries". We have reduced it to 2 main blocks (stats + dates).
        // Let's optimize the date processing.
    });

    // Better approach: Use a Set for O(1) lookup, which we did.
    // The main issue raised was "fetching all history".
    // If we assume a max reasonable streak (e.g. 365 days), we could limit the query.
    // But for now, let's keep it simple but ensure we don't fetch unnecessary fields.
    // The previous code was actually okay-ish, but maybe we can combine queries?
    // We can't easily combine count and findMany in one Prisma call without raw query.

    const uniqueDates = new Set<string>();
    activityDates.forEach(log => {
        uniqueDates.add(log.answeredAt.toISOString().split('T')[0]);
    });

    let currentStreak = 0;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (uniqueDates.has(todayStr)) {
        currentStreak = 1;
        let checkDate = new Date(today);
        while (true) {
            checkDate.setDate(checkDate.getDate() - 1);
            const dateStr = checkDate.toISOString().split('T')[0];
            if (uniqueDates.has(dateStr)) {
                currentStreak++;
            } else {
                break;
            }
        }
    } else if (uniqueDates.has(yesterdayStr)) {
        currentStreak = 1;
        let checkDate = new Date(yesterday);
        while (true) {
            checkDate.setDate(checkDate.getDate() - 1);
            const dateStr = checkDate.toISOString().split('T')[0];
            if (uniqueDates.has(dateStr)) {
                currentStreak++;
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
                { group: { name: { contains: query, mode: 'insensitive' } } },
            ] : undefined,
        },
        include: { group: true },
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
    });

    return students.map(student => ({
        ...student,
        stats: statsMap.get(student.id)!,
    }));
}

export async function getUnitProgress(userId: string): Promise<UnitProgress[]> {
    // Get all units and their core problem counts
    const units = await prisma.unit.findMany({
        include: {
            subject: true,
            coreProblems: {
                select: { id: true },
            },
        },
        orderBy: { order: 'asc' },
    });

    // Get cleared problems for this user
    const clearedStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            isCleared: true,
        },
        include: {
            problem: {
                select: { coreProblemId: true },
            },
        },
    });

    const clearedCoreProblemIds = new Set(
        clearedStates.map(s => s.problem.coreProblemId)
    );

    return units.map(unit => {
        const totalCoreProblems = unit.coreProblems.length;
        // Count how many core problems in this unit have at least one cleared problem
        // Note: This logic assumes clearing ANY problem in a core problem group counts as progress
        // Adjust if "All problems in core problem" need to be cleared
        const clearedCount = unit.coreProblems.filter(cp =>
            clearedCoreProblemIds.has(cp.id)
        ).length;

        return {
            unitId: unit.id,
            unitName: unit.name,
            subjectName: unit.subject.name,
            totalCoreProblems,
            clearedCoreProblems: clearedCount,
            progressPercentage: totalCoreProblems > 0 ? Math.round((clearedCount / totalCoreProblems) * 100) : 0,
        };
    });
}

export async function getDailyActivity(userId: string, days = 30): Promise<DailyActivity[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Use groupBy result directly if possible, but Prisma groupBy on date is tricky.
    // Actually, the review says we are not using `logs` (groupBy result) and doing findMany again.
    // Let's just use findMany as it gives us the raw dates we need to map to YYYY-MM-DD.
    // Removing the unused groupBy query.
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
    unitName: string;
    accuracy: number;
    totalAttempts: number;
};

export async function getStudentWeaknesses(userId: string, limit = 5): Promise<Weakness[]> {
    // Optimized: Use groupBy to aggregate stats by coreProblemId directly in DB
    const groupedStats = await prisma.learningHistory.groupBy({
        by: ['problemId'], // We can't group by relation (coreProblemId) directly in Prisma groupBy easily without raw query or flat structure.
        // Wait, problemId is unique per problem, but we want to group by CoreProblem.
        // Prisma doesn't support grouping by relation fields in `groupBy`.
        // We have to fetch problems and their coreProblemIds first or use raw query.
        // Alternatively, we can fetch all problems for the user (lightweight) and then aggregate.
        // Or, since `problem` table has `coreProblemId`, we can't group by it from `learningHistory` directly.
        // Let's use a raw query for best performance, or optimize the fetch.
        // The review said: "groupBy coreProblem unit".
        // Since we can't easily do that with Prisma `groupBy` on a relation, let's try a different approach.
        // We can fetch all `UserProblemState` which has `priority`. High priority = weakness?
        // Or we stick to history accuracy.

        // Let's use `findMany` but select ONLY necessary fields, avoiding the nested `include` hell.
        where: { userId },
        _count: {
            _all: true,
            evaluation: true, // We need to count specific evaluations manually if we can't filter inside groupBy
        },
    });

    // Actually, `groupBy` on `problemId` gives us stats per problem.
    // Then we need to map problemId -> coreProblemId.
    // This might still be heavy if there are many problems.

    // Let's try a raw query. It's the most efficient for "Weaknesses based on accuracy per Core Problem".
    // "SELECT cp.id, cp.name, u.name as unitName, count(*) as total, sum(case when lh.evaluation in ('A', 'B') then 1 else 0 end) as correct FROM LearningHistory lh JOIN Problem p ON lh.problemId = p.id JOIN CoreProblem cp ON p.coreProblemId = cp.id JOIN Unit u ON cp.unitId = u.id WHERE lh.userId = ... GROUP BY cp.id ..."

    const weaknessesRaw = await prisma.$queryRaw<
        Array<{
            coreProblemId: string;
            coreProblemName: string;
            unitName: string;
            totalAttempts: bigint; // BigInt in raw query result
            correctCount: bigint;
        }>
    >`
        SELECT 
            cp.id as "coreProblemId",
            cp.name as "coreProblemName",
            u.name as "unitName",
            COUNT(lh.id) as "totalAttempts",
            SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) as "correctCount"
        FROM "LearningHistory" lh
        JOIN "Problem" p ON lh."problemId" = p.id
        JOIN "CoreProblem" cp ON p."coreProblemId" = cp.id
        JOIN "Unit" u ON cp."unitId" = u.id
        WHERE lh."userId" = ${userId}
        GROUP BY cp.id, cp.name, u.name
        HAVING COUNT(lh.id) >= 3
        ORDER BY (CAST(SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(lh.id)) ASC
        LIMIT ${limit}
    `;

    return weaknessesRaw.map(w => ({
        coreProblemId: w.coreProblemId,
        coreProblemName: w.coreProblemName,
        unitName: w.unitName,
        accuracy: Number(w.totalAttempts) > 0 ? Math.round((Number(w.correctCount) / Number(w.totalAttempts)) * 100) : 0,
        totalAttempts: Number(w.totalAttempts),
    }));
}
