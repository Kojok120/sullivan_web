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

    // Streak calculation
    const activityDates = await prisma.learningHistory.findMany({
        where: { userId },
        select: { answeredAt: true },
        orderBy: { answeredAt: 'desc' },
    });

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

    // If no activity today or yesterday, streak is broken (0), unless we want to be lenient.
    // Usually, if you haven't done it today yet, but did it yesterday, streak is kept.
    // If you missed yesterday, streak is 0.

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
    // Fetch all learning history for this user
    const histories = await prisma.learningHistory.findMany({
        where: { userId },
        include: {
            problem: {
                include: {
                    coreProblem: {
                        include: {
                            unit: true
                        }
                    }
                }
            }
        }
    });

    // Group by CoreProblem
    const cpStats = new Map<string, {
        name: string;
        unitName: string;
        correct: number;
        total: number;
    }>();

    histories.forEach(h => {
        const cpId = h.problem.coreProblemId;
        const cpName = h.problem.coreProblem.name;
        const unitName = h.problem.coreProblem.unit.name;
        const isCorrect = h.evaluation === 'A' || h.evaluation === 'B';

        if (!cpStats.has(cpId)) {
            cpStats.set(cpId, { name: cpName, unitName, correct: 0, total: 0 });
        }

        const stats = cpStats.get(cpId)!;
        stats.total++;
        if (isCorrect) stats.correct++;
    });

    // Calculate accuracy and filter/sort
    const weaknesses: Weakness[] = [];
    cpStats.forEach((stats, id) => {
        const accuracy = Math.round((stats.correct / stats.total) * 100);
        // Consider it a weakness if accuracy is below 70% and at least 3 attempts made
        // Or just return lowest accuracy items regardless of threshold
        if (stats.total >= 3) {
            weaknesses.push({
                coreProblemId: id,
                coreProblemName: stats.name,
                unitName: stats.unitName,
                accuracy,
                totalAttempts: stats.total
            });
        }
    });

    // Sort by accuracy ascending (lowest first)
    return weaknesses
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, limit);
}
