import { prisma } from '@/lib/prisma';
import { addDaysToDateKey, getDateKeyInTimeZone, normalizeTimeZone } from '@/lib/date-key';
import type { RankingEntry, RankingResponse } from '@/lib/types/ranking';

type RankingActorRole = 'STUDENT' | 'TEACHER' | 'HEAD_TEACHER' | 'ADMIN';

type RankingPeriodRange = {
    startDateKey: string;
    endExclusiveDateKey: string;
    label: string;
};

type RankingQueryRow = {
    userId: string;
    name: string;
    loginId: string;
    group: string | null;
    value: number;
};

const SUPPORTED_ROLES = new Set<RankingActorRole>(['STUDENT', 'TEACHER', 'HEAD_TEACHER', 'ADMIN']);

export class RankingServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function asRankingRole(role: string): RankingActorRole {
    if (!SUPPORTED_ROLES.has(role as RankingActorRole)) {
        throw new RankingServiceError(403, 'ランキングを閲覧する権限がありません');
    }

    return role as RankingActorRole;
}

function getWeekdayIndexInTimeZone(date: Date, timeZone: string): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone,
    }).format(date);

    const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return map[weekday] ?? 0;
}

function getMonthStartDateKey(dateKey: string): string {
    return `${dateKey.slice(0, 7)}-01`;
}

function getNextMonthStartDateKey(monthStartDateKey: string): string {
    const year = Number(monthStartDateKey.slice(0, 4));
    const month = Number(monthStartDateKey.slice(5, 7));

    if (month === 12) {
        return `${String(year + 1)}-01-01`;
    }

    return `${String(year)}-${String(month + 1).padStart(2, '0')}-01`;
}

function buildPeriodRanges(timeZone: string): {
    week: RankingPeriodRange;
    month: RankingPeriodRange;
} {
    const now = new Date();
    const todayKey = getDateKeyInTimeZone(now, timeZone);

    const weekdayIndex = getWeekdayIndexInTimeZone(now, timeZone);
    const mondayOffset = (weekdayIndex + 6) % 7;

    const weekStartDateKey = addDaysToDateKey(todayKey, -mondayOffset);
    const nextWeekStartDateKey = addDaysToDateKey(weekStartDateKey, 7);
    const weekEndDateKey = addDaysToDateKey(nextWeekStartDateKey, -1);

    const monthStartDateKey = getMonthStartDateKey(todayKey);
    const nextMonthStartDateKey = getNextMonthStartDateKey(monthStartDateKey);
    const monthEndDateKey = addDaysToDateKey(nextMonthStartDateKey, -1);

    return {
        week: {
            startDateKey: weekStartDateKey,
            endExclusiveDateKey: nextWeekStartDateKey,
            label: `${weekStartDateKey}〜${weekEndDateKey}`,
        },
        month: {
            startDateKey: monthStartDateKey,
            endExclusiveDateKey: nextMonthStartDateKey,
            label: `${monthStartDateKey}〜${monthEndDateKey}`,
        },
    };
}

async function resolveClassroomForActor(params: {
    actorUserId: string;
    actorRole: RankingActorRole;
    requestedClassroomId?: string | null;
}) {
    const { actorUserId, actorRole, requestedClassroomId } = params;

    if (actorRole === 'ADMIN') {
        if (!requestedClassroomId) {
            throw new RankingServiceError(400, '管理者は教室を選択してください');
        }

        const classroom = await prisma.classroom.findUnique({
            where: { id: requestedClassroomId },
            select: { id: true, name: true },
        });

        if (!classroom) {
            throw new RankingServiceError(404, '指定された教室が見つかりません');
        }

        return classroom;
    }

    const actor = await prisma.user.findUnique({
        where: { id: actorUserId },
        select: {
            classroomId: true,
            classroom: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!actor?.classroomId || !actor.classroom) {
        throw new RankingServiceError(400, '所属教室が設定されていません');
    }

    return actor.classroom;
}

function toRankingEntries(rows: RankingQueryRow[]): RankingEntry[] {
    return rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.name,
        loginId: row.loginId,
        group: row.group,
        value: Number(row.value),
    }));
}

async function getProblemCountRanking(params: {
    classroomId: string;
    timeZone: string;
    startDateKey: string;
    endExclusiveDateKey: string;
}): Promise<RankingEntry[]> {
    const rows = await prisma.$queryRaw<RankingQueryRow[]>`
        SELECT
            u.id as "userId",
            COALESCE(NULLIF(u.name, ''), u."loginId") as "name",
            u."loginId" as "loginId",
            u."group" as "group",
            COUNT(lh.id)::int as "value"
        FROM "LearningHistory" lh
        INNER JOIN "User" u ON u.id = lh."userId"
        WHERE u.role = 'STUDENT'
          AND u."classroomId" = ${params.classroomId}
          AND lh."answeredAt" >= ((${params.startDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
          AND lh."answeredAt" < ((${params.endExclusiveDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
        GROUP BY u.id, u.name, u."loginId", u."group"
        ORDER BY "value" DESC,
                 COALESCE(NULLIF(u.name, ''), u."loginId") ASC,
                 u."loginId" ASC
        LIMIT 10
    `;

    return toRankingEntries(rows);
}

async function getVocabularyScoreRanking(params: {
    classroomId: string;
    timeZone: string;
    startDateKey: string;
    endExclusiveDateKey: string;
}): Promise<RankingEntry[]> {
    const rows = await prisma.$queryRaw<RankingQueryRow[]>`
        SELECT
            u.id as "userId",
            COALESCE(NULLIF(u.name, ''), u."loginId") as "name",
            u."loginId" as "loginId",
            u."group" as "group",
            SUM(vgs.score)::int as "value"
        FROM "VocabularyGameScore" vgs
        INNER JOIN "User" u ON u.id = vgs."userId"
        WHERE u.role = 'STUDENT'
          AND u."classroomId" = ${params.classroomId}
          AND vgs."playedAt" >= ((${params.startDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
          AND vgs."playedAt" < ((${params.endExclusiveDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
        GROUP BY u.id, u.name, u."loginId", u."group"
        HAVING SUM(vgs.score) > 0
        ORDER BY "value" DESC,
                 COALESCE(NULLIF(u.name, ''), u."loginId") ASC,
                 u."loginId" ASC
        LIMIT 10
    `;

    return toRankingEntries(rows);
}

export async function getClassroomRankingPayload(params: {
    actorUserId: string;
    actorRole: string;
    requestedClassroomId?: string | null;
    timeZone?: string | null;
}): Promise<RankingResponse> {
    const actorRole = asRankingRole(params.actorRole);
    const timeZone = normalizeTimeZone(params.timeZone);
    const classroom = await resolveClassroomForActor({
        actorUserId: params.actorUserId,
        actorRole,
        requestedClassroomId: params.requestedClassroomId,
    });

    const periodRanges = buildPeriodRanges(timeZone);

    const [problemWeek, problemMonth, vocabWeek, vocabMonth] = await Promise.all([
        getProblemCountRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: periodRanges.week.startDateKey,
            endExclusiveDateKey: periodRanges.week.endExclusiveDateKey,
        }),
        getProblemCountRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: periodRanges.month.startDateKey,
            endExclusiveDateKey: periodRanges.month.endExclusiveDateKey,
        }),
        getVocabularyScoreRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: periodRanges.week.startDateKey,
            endExclusiveDateKey: periodRanges.week.endExclusiveDateKey,
        }),
        getVocabularyScoreRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: periodRanges.month.startDateKey,
            endExclusiveDateKey: periodRanges.month.endExclusiveDateKey,
        }),
    ]);

    return {
        classroom,
        timeZone,
        periods: {
            week: {
                label: periodRanges.week.label,
            },
            month: {
                label: periodRanges.month.label,
            },
        },
        problemCount: {
            week: problemWeek,
            month: problemMonth,
        },
        vocabularyScore: {
            week: vocabWeek,
            month: vocabMonth,
        },
    };
}
