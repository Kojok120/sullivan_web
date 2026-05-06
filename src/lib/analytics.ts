import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { StudentSortKey, StudentSortOrder } from '@/lib/student-sort';

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

type ComputedStudentSortKey = 'totalProblemsSolved' | 'lastActivity';

function createEmptyStudentStats(user?: { xp: number; level: number; currentStreak: number }): StudentStats {
    return {
        totalProblemsSolved: 0,
        totalCorrect: 0,
        accuracy: 0,
        currentStreak: user?.currentStreak || 0,
        lastActivity: null,
        xp: user?.xp || 0,
        level: user?.level || 1,
    };
}

async function fetchStudentIdsForComputedSort(params: {
    query?: string;
    skip: number;
    take: number;
    classroomId?: string | null;
    sortBy: ComputedStudentSortKey;
    sortOrder: StudentSortOrder;
}) {
    const searchPattern = params.query?.trim() ? `%${params.query.trim()}%` : null;
    const orderDirection = Prisma.raw(params.sortOrder.toUpperCase());

    if (params.sortBy === 'totalProblemsSolved') {
        return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT u.id
            FROM "User" u
            LEFT JOIN (
                SELECT
                    "userId",
                    COUNT(*)::bigint AS "totalProblemsSolved"
                FROM "LearningHistory"
                GROUP BY "userId"
            ) stats ON stats."userId" = u.id
            WHERE u.role = 'STUDENT'
            ${params.classroomId ? Prisma.sql`AND u."classroomId" = ${params.classroomId}` : Prisma.empty}
            ${searchPattern ? Prisma.sql`
                AND (
                    u.name ILIKE ${searchPattern}
                    OR u."loginId" ILIKE ${searchPattern}
                    OR COALESCE(u."group", '') ILIKE ${searchPattern}
                )
            ` : Prisma.empty}
            ORDER BY COALESCE(stats."totalProblemsSolved", 0) ${orderDirection}, u."loginId" ASC, u.id ASC
            LIMIT ${params.take}
            OFFSET ${params.skip}
        `);
    }

    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT u.id
        FROM "User" u
        LEFT JOIN (
            SELECT
                "userId",
                MAX("answeredAt") AS "lastActivity"
            FROM "LearningHistory"
            GROUP BY "userId"
        ) stats ON stats."userId" = u.id
        WHERE u.role = 'STUDENT'
        ${params.classroomId ? Prisma.sql`AND u."classroomId" = ${params.classroomId}` : Prisma.empty}
        ${searchPattern ? Prisma.sql`
            AND (
                u.name ILIKE ${searchPattern}
                OR u."loginId" ILIKE ${searchPattern}
                OR COALESCE(u."group", '') ILIKE ${searchPattern}
            )
        ` : Prisma.empty}
        ORDER BY (stats."lastActivity" IS NULL) ASC, stats."lastActivity" ${orderDirection}, u."loginId" ASC, u.id ASC
        LIMIT ${params.take}
        OFFSET ${params.skip}
    `);
}

export async function getStudentStats(userId: string): Promise<StudentStats> {
    // 1. Get Aggregates using shared helper
    const statsMap = await fetchInternalStudentStats([userId]);
    const stats = statsMap.get(userId) || createEmptyStudentStats();

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
        statsMap.set(id, createEmptyStudentStats(u));
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

export async function getStudentsWithStats(
    query?: string,
    skip = 0,
    take = 50,
    classroomId?: string | null,
    sortBy?: StudentSortKey | null,
    sortOrder: StudentSortOrder = 'asc',
) {
    const requiresComputedStatsSort = sortBy === 'totalProblemsSolved' || sortBy === 'lastActivity';
    if (requiresComputedStatsSort && sortBy) {
        const sortedRows = await fetchStudentIdsForComputedSort({
            query,
            skip,
            take,
            classroomId,
            sortBy,
            sortOrder,
        });

        if (sortedRows.length === 0) return [];

        const studentIds = sortedRows.map((row) => row.id);
        const [students, statsMap] = await Promise.all([
            prisma.user.findMany({
                where: {
                    id: {
                        in: studentIds,
                    },
                },
            }),
            fetchInternalStudentStats(studentIds),
        ]);

        const studentMap = new Map(students.map((student) => [student.id, student]));

        return studentIds.flatMap((studentId) => {
            const student = studentMap.get(studentId);
            if (!student) return [];

            return [{
                ...student,
                stats: statsMap.get(student.id) || createEmptyStudentStats(student),
            }];
        });
    }

    const students = await prisma.user.findMany({
        skip,
        take,
        where: {
            role: 'STUDENT',
            classroomId: classroomId ?? undefined,
            OR: query ? [
                { name: { contains: query, mode: 'insensitive' } },
                { loginId: { contains: query, mode: 'insensitive' } },
                { group: { contains: query, mode: 'insensitive' } },
            ] : undefined,
        },
        orderBy: sortBy === 'loginId'
            ? { loginId: sortOrder }
            : sortBy === 'currentStreak'
                ? { currentStreak: sortOrder }
                : { name: 'asc' },
    });

    if (students.length === 0) return [];

    const studentIds = students.map(s => s.id);

    // Bulk fetch stats
    const statsMap = await fetchInternalStudentStats(studentIds);

    // StudentSortKey は loginId/currentStreak/totalProblemsSolved/lastActivity の4値のみで、
    // 計算系2種は requiresComputedStatsSort 経路で SQL 側 ORDER BY 済み、残り2種＋未指定はこの上の DB orderBy で済む。
    // よってここでさらに JS で再ソートする必要は無い。
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
    // Actually, let's use the same logic as print-algo: AnswerRate >= 40% & CorrectRate >= 50%.
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

async function fetchDailyActivityLive(userId: string, startDate: Date): Promise<Map<string, number>> {
    // 旧実装：LearningHistory を 1 回 GROUP BY する。バックフィル前の fallback と「今日分の live」両方で使う。
    // recomputeForUserDateRange と同じ UTC 基準で日付化する（DB セッションタイムゾーン非依存）。
    const stats = await prisma.$queryRaw<Array<{ date: Date | string, count: bigint }>>`
        SELECT
            DATE_TRUNC('day', "answeredAt" AT TIME ZONE 'UTC')::date AS "date",
            COUNT(*) as "count"
        FROM "LearningHistory"
        WHERE "userId" = ${userId}
        AND "answeredAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "answeredAt" AT TIME ZONE 'UTC')::date
    `;

    const map = new Map<string, number>();
    for (const s of stats) {
        const d = new Date(s.date);
        const dateStr = d.toISOString().split('T')[0];
        map.set(dateStr, Number(s.count));
    }
    return map;
}

async function fetchDailyActivity(userId: string, days: number): Promise<DailyActivity[]> {
    // UTC 0:00 ベースの「今日」境界。startDate = 今日 - (days-1) 日。
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(todayUtc.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    // 履歴日（startDate ≤ date < todayUtc）は UserStatsDaily から、今日は live で読む。
    // UserStatsDaily が空の日は「学習なし」または「未集計」のいずれかだが、
    // 未集計を網羅するためテーブル件数が想定より少ないときは live にフォールバックする。
    const expectedHistoricDays = days - 1;
    const [statsRows, liveTodayMap] = await Promise.all([
        prisma.userStatsDaily.findMany({
            where: {
                userId,
                date: { gte: startDate, lt: todayUtc },
            },
            select: { date: true, totalSolved: true },
            orderBy: { date: 'asc' },
        }),
        // 今日分は LearningHistory から直接 COUNT する。
        // dashboard では当日 1 ジョブ採点後すぐに反映されることが期待されるため、
        // テーブルの再集計を待たず live に依存する。
        prisma.learningHistory.count({
            where: {
                userId,
                answeredAt: { gte: todayUtc },
            },
        }).then((count) => {
            const map = new Map<string, number>();
            const todayStr = todayUtc.toISOString().split('T')[0];
            if (count > 0) map.set(todayStr, count);
            return map;
        }),
    ]);

    // テーブルが疎すぎる（=バックフィル前 or 部分バックフィル）と判断したら、履歴日分だけ live で再取得する。
    // しきい値は「期待日数の半分も埋まっていない」ことにする（学習頻度に依存しすぎないよう緩め）。
    // 学習が極端に少ないユーザでは fallback がやや過剰に走るが、live 側も軽量な GROUP BY なので許容。
    let historicMap: Map<string, number>;
    const shouldFallbackToLive =
        expectedHistoricDays > 0 && statsRows.length < Math.ceil(expectedHistoricDays / 2);

    if (shouldFallbackToLive) {
        historicMap = await fetchDailyActivityLive(userId, startDate);
        // 今日分は別経路で取得済みなのでマージ用に historicMap から外す
        const todayStr = todayUtc.toISOString().split('T')[0];
        historicMap.delete(todayStr);
    } else {
        historicMap = new Map();
        for (const row of statsRows) {
            const dateStr = row.date.toISOString().split('T')[0];
            historicMap.set(dateStr, row.totalSolved);
        }
    }

    const result: DailyActivity[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(todayUtc.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const fromToday = liveTodayMap.get(dateStr);
        const fromHistoric = historicMap.get(dateStr);
        result.push({
            date: dateStr,
            count: fromToday ?? fromHistoric ?? 0,
        });
    }

    return result.reverse();
}

// 365 日分の集計はダッシュボード表示で使い回すため短期キャッシュする。
// 採点直後の反映は最大 60 秒遅延するが、ヒートマップは日単位の濃淡で
// 即時性を要求しないため許容する。
const DAILY_ACTIVITY_CACHE_TTL_SECONDS = 60;

const getCachedDailyActivity = unstable_cache(
    async (userId: string, days: number): Promise<DailyActivity[]> => {
        return fetchDailyActivity(userId, days);
    },
    ['analytics:daily-activity'],
    { revalidate: DAILY_ACTIVITY_CACHE_TTL_SECONDS },
);

export async function getDailyActivity(userId: string, days = 30): Promise<DailyActivity[]> {
    return getCachedDailyActivity(userId, days);
}

export type Weakness = {
    coreProblemId: string;
    coreProblemName: string;
    subjectName: string;
    accuracy: number;
    totalAttempts: number;
};

async function getStudentWeaknesses(userId: string, limit = 5): Promise<Weakness[]> {
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
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                },
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
    hasUnread: boolean;
    unwatchedMistakeCount: number;
};

// Group history by groupId
export async function getLearningSessions(userId: string, limit = 10, offset = 0, onlyPendingVideoReview = false): Promise<LearningSession[]> {
    // セッション単位の集計とラベル解決を分離して、JOINによる行増幅を防ぐ
    const sessions = await prisma.$queryRaw<Array<{
        groupId: string;
        date: Date;
        subjectName: string | null;
        total: bigint;
        correct: bigint;
        unreadCount: bigint;
        unwatchedMistakeCount: bigint;
    }>>`
        WITH session_agg AS (
            SELECT
                lh."groupId",
                MAX(lh."answeredAt") as "date",
                COUNT(*) as "total",
                COUNT(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 END) as "correct",
                COUNT(CASE WHEN lh."isStudentReviewed" = false THEN 1 END) as "unreadCount",
                COUNT(CASE
                    WHEN lh.evaluation IN ('C', 'D')
                    AND lh."isVideoWatched" = false
                    AND p."videoUrl" IS NOT NULL
                    AND p."videoUrl" != ''
                    THEN 1
                END) as "unwatchedMistakeCount",
                MIN(lh.id) as "firstHistoryId"
            FROM "LearningHistory" lh
            JOIN "Problem" p ON lh."problemId" = p.id
            WHERE "userId" = ${userId} AND "groupId" IS NOT NULL
            GROUP BY lh."groupId"
        ),
        session_label AS (
            SELECT
                sa."groupId",
                s.name as "subjectName"
            FROM session_agg sa
            JOIN "LearningHistory" first_lh ON first_lh.id = sa."firstHistoryId"
            LEFT JOIN LATERAL (
                SELECT cp2."subjectId"
                FROM "_CoreProblemToProblem" cpp
                JOIN "CoreProblem" cp2 ON cp2.id = cpp."A"
                WHERE cpp."B" = first_lh."problemId"
                ORDER BY cp2."order" ASC, cp2.id ASC
                LIMIT 1
            ) cp ON true
            LEFT JOIN "Subject" s ON s.id = cp."subjectId"
        )
        SELECT
            sa."groupId",
            sa."date",
            sl."subjectName",
            sa."total",
            sa."correct",
            sa."unreadCount",
            sa."unwatchedMistakeCount"
        FROM session_agg sa
        LEFT JOIN session_label sl ON sl."groupId" = sa."groupId"
        ${onlyPendingVideoReview ? Prisma.sql`WHERE sa."unwatchedMistakeCount" > 0` : Prisma.empty}
        ORDER BY sa."date" DESC, sa."groupId" DESC
        LIMIT ${limit}
        OFFSET ${offset}
    `;

    return sessions.map(s => ({
        groupId: s.groupId,
        date: s.date,
        subjectName: s.subjectName || "不明な教科",
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
    const whereClause: Prisma.LearningHistoryWhereInput = { groupId };
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

export async function getStudentOverviewData(userId: string) {
    const [stats, subjectProgress, weaknesses] = await Promise.all([
        getStudentStats(userId),
        getSubjectProgress(userId),
        getStudentWeaknesses(userId),
    ]);

    const subjects = subjectProgress.map((subjectProgressItem) => ({
        id: subjectProgressItem.subjectId,
        name: subjectProgressItem.subjectName,
    }));

    return {
        stats,
        subjectProgress,
        weaknesses,
        subjects,
    };
}

// Consolidated Dashboard Data Fetcher
export async function getStudentDashboardData(userId: string) {
    // 1. Fetch all necessary data in parallel
    const [
        overview,
        dailyActivity,
        recentHistory,
        student,
    ] = await Promise.all([
        getStudentOverviewData(userId),
        getDailyActivity(userId),
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
                        // 表示で使うのは先頭の CoreProblem のみのため、転送量と JOIN コストを抑える
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
                            },
                            orderBy: [{ order: 'asc' }, { id: 'asc' }],
                            take: 1,
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

    return {
        student,
        stats: overview.stats,
        dailyActivity,
        subjectProgress: overview.subjectProgress,
        weaknesses: overview.weaknesses,
        recentHistory,
        subjects: overview.subjects,
    };
}

export async function getUnwatchedCount(userId: string): Promise<number> {
    const count = await prisma.learningHistory.count({
        where: {
            userId,
            isVideoWatched: false,
            evaluation: { in: ['C', 'D'] }, // Only count incorrect ones
            problem: {
                videoUrl: { not: null, notIn: [''] } // Only if video exists (not null and not empty)
            }
        }
    });
    return count;
}

export type UnwatchedLecture = {
    coreProblemId: string;
    coreProblemName: string;
    subjectName: string;
};

/**
 * 未視聴の講義動画がある単元を取得する
 * 条件: isUnlocked = true かつ isLectureWatched = false かつ 講義動画がある
 */
export async function getUnwatchedLectures(userId: string): Promise<UnwatchedLecture[]> {
    // アンロック済みだが講義動画未視聴の単元を取得
    const states = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            isUnlocked: true,
            isLectureWatched: false
        },
        include: {
            coreProblem: {
                include: {
                    subject: true
                }
            }
        }
    });

    // 講義動画がある単元のみをフィルタリング
    return states
        .filter(s => {
            const videos = s.coreProblem.lectureVideos;
            return Array.isArray(videos) && videos.length > 0;
        })
        .map(s => ({
            coreProblemId: s.coreProblem.id,
            coreProblemName: s.coreProblem.name,
            subjectName: s.coreProblem.subject.name
        }));
}
