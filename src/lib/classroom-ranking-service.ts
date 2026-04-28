import { addDaysToDateKey, getDateKeyInTimeZone, normalizeTimeZone } from '@/lib/date-key';
import { prisma } from '@/lib/prisma';
import {
    RANKING_ACCURACY_MIN_ANSWER_COUNT,
    RANKING_CUSTOM_RANGE_MAX_MONTHS,
    type LegacyRankingResponse,
    type RankingEntry,
    type RankingPeriodKey,
    type RankingResponse,
} from '@/lib/types/ranking';

type RankingActorRole = 'STUDENT' | 'TEACHER' | 'HEAD_TEACHER' | 'ADMIN';

type RankingPeriodRange = {
    startDateKey: string;
    endExclusiveDateKey: string;
    label: string;
};

export type ResolvedRankingPeriod = {
    key: RankingPeriodKey;
    label: string;
    startMonth: string;
    endMonth: string;
    startDateKey: string;
    endExclusiveDateKey: string;
};

type RankingQueryRow = {
    userId: string;
    name: string;
    loginId: string;
    group: string | null;
    value: number;
};

type AccuracyRankingQueryRow = RankingQueryRow & {
    answerCount: number;
};

const SUPPORTED_ROLES = new Set<RankingActorRole>(['STUDENT', 'TEACHER', 'HEAD_TEACHER', 'ADMIN']);
const MONTH_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PRESET_PERIOD_MONTHS: Record<Exclude<RankingPeriodKey, 'custom'>, number> = {
    '1m': 1,
    '3m': 3,
    '12m': 12,
};

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

function getCurrentMonthKey(date: Date, timeZone: string): string {
    return getDateKeyInTimeZone(date, timeZone).slice(0, 7);
}

function parseMonthKey(monthKey: string) {
    const match = MONTH_KEY_REGEX.exec(monthKey);
    if (!match) {
        return null;
    }

    return {
        year: Number(match[1]),
        month: Number(match[2]),
    };
}

function isValidMonthKey(monthKey: string): boolean {
    return parseMonthKey(monthKey) !== null;
}

function addMonthsToMonthKey(monthKey: string, offsetMonths: number): string {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) {
        throw new RankingServiceError(400, '月の形式が不正です');
    }

    const nextDate = new Date(Date.UTC(parsed.year, parsed.month - 1 + offsetMonths, 1));
    const year = nextDate.getUTCFullYear();
    const month = String(nextDate.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
}

function countInclusiveMonths(startMonth: string, endMonth: string): number {
    const start = parseMonthKey(startMonth);
    const end = parseMonthKey(endMonth);
    if (!start || !end) {
        throw new RankingServiceError(400, '月の形式が不正です');
    }

    return (end.year - start.year) * 12 + (end.month - start.month) + 1;
}

function buildMonthRangeLabel(startMonth: string, endMonth: string): string {
    return startMonth === endMonth ? startMonth : `${startMonth}〜${endMonth}`;
}

function buildLegacyPeriodRanges(timeZone: string, now: Date): {
    week: RankingPeriodRange;
    month: RankingPeriodRange;
} {
    const todayKey = getDateKeyInTimeZone(now, timeZone);

    const weekdayIndex = getWeekdayIndexInTimeZone(now, timeZone);
    const mondayOffset = (weekdayIndex + 6) % 7;

    const weekStartDateKey = addDaysToDateKey(todayKey, -mondayOffset);
    const nextWeekStartDateKey = addDaysToDateKey(weekStartDateKey, 7);
    const weekEndDateKey = addDaysToDateKey(nextWeekStartDateKey, -1);

    const currentMonth = getCurrentMonthKey(now, timeZone);
    const monthStartDateKey = `${currentMonth}-01`;
    const nextMonthStartDateKey = `${addMonthsToMonthKey(currentMonth, 1)}-01`;
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

export function resolveRankingPeriod(params: {
    periodKey?: RankingPeriodKey | null;
    startMonth?: string | null;
    endMonth?: string | null;
    timeZone: string;
    now?: Date;
}): ResolvedRankingPeriod {
    const periodKey = params.periodKey ?? '1m';
    const now = params.now ?? new Date();
    const currentMonth = getCurrentMonthKey(now, params.timeZone);

    if (periodKey === 'custom') {
        const startMonth = params.startMonth ?? '';
        const endMonth = params.endMonth ?? '';

        if (!startMonth || !endMonth) {
            throw new RankingServiceError(400, '自由指定では開始月と終了月を指定してください');
        }

        if (!isValidMonthKey(startMonth) || !isValidMonthKey(endMonth)) {
            throw new RankingServiceError(400, '開始月または終了月の形式が不正です');
        }

        if (startMonth > endMonth) {
            throw new RankingServiceError(400, '開始月は終了月以前を指定してください');
        }

        const monthCount = countInclusiveMonths(startMonth, endMonth);
        if (monthCount > RANKING_CUSTOM_RANGE_MAX_MONTHS) {
            throw new RankingServiceError(400, `自由指定は最大${RANKING_CUSTOM_RANGE_MAX_MONTHS}ヶ月までです`);
        }

        return {
            key: periodKey,
            label: buildMonthRangeLabel(startMonth, endMonth),
            startMonth,
            endMonth,
            startDateKey: `${startMonth}-01`,
            endExclusiveDateKey: `${addMonthsToMonthKey(endMonth, 1)}-01`,
        };
    }

    const monthSpan = PRESET_PERIOD_MONTHS[periodKey];
    const endMonth = currentMonth;
    const startMonth = addMonthsToMonthKey(currentMonth, -(monthSpan - 1));

    return {
        key: periodKey,
        label: buildMonthRangeLabel(startMonth, endMonth),
        startMonth,
        endMonth,
        startDateKey: `${startMonth}-01`,
        endExclusiveDateKey: `${addMonthsToMonthKey(endMonth, 1)}-01`,
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

function toRankingEntries<T extends RankingQueryRow>(rows: T[]): RankingEntry[] {
    let currentRank = 1;
    let previousValue: number | null = null;

    return rows.map((row, index) => {
        const value = Number(row.value);

        if (previousValue === null || value < previousValue) {
            currentRank = index + 1;
        }
        previousValue = value;

        return {
            rank: currentRank,
            userId: row.userId,
            name: row.name,
            loginId: row.loginId,
            group: row.group,
            value,
        };
    });
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

async function getAccuracyRanking(params: {
    classroomId: string;
    timeZone: string;
    startDateKey: string;
    endExclusiveDateKey: string;
}): Promise<RankingEntry[]> {
    const rows = await prisma.$queryRaw<AccuracyRankingQueryRow[]>`
        SELECT
            u.id as "userId",
            COALESCE(NULLIF(u.name, ''), u."loginId") as "name",
            u."loginId" as "loginId",
            u."group" as "group",
            ROUND(SUM(CASE WHEN lh.evaluation IN ('A', 'B') THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::int as "value",
            COUNT(*)::int as "answerCount"
        FROM "LearningHistory" lh
        INNER JOIN "User" u ON u.id = lh."userId"
        WHERE u.role = 'STUDENT'
          AND u."classroomId" = ${params.classroomId}
          AND lh."answeredAt" >= ((${params.startDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
          AND lh."answeredAt" < ((${params.endExclusiveDateKey}::timestamp AT TIME ZONE ${params.timeZone}) AT TIME ZONE 'UTC')
        GROUP BY u.id, u.name, u."loginId", u."group"
        HAVING COUNT(*) >= ${RANKING_ACCURACY_MIN_ANSWER_COUNT}
        ORDER BY "value" DESC,
                 "answerCount" DESC,
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
    periodKey?: RankingPeriodKey | null;
    startMonth?: string | null;
    endMonth?: string | null;
    now?: Date;
}): Promise<RankingResponse> {
    const actorRole = asRankingRole(params.actorRole);
    const timeZone = normalizeTimeZone(params.timeZone);
    const classroom = await resolveClassroomForActor({
        actorUserId: params.actorUserId,
        actorRole,
        requestedClassroomId: params.requestedClassroomId,
    });

    const period = resolveRankingPeriod({
        periodKey: params.periodKey,
        startMonth: params.startMonth,
        endMonth: params.endMonth,
        timeZone,
        now: params.now,
    });

    const [problemCount, vocabularyScore, accuracy] = await Promise.all([
        getProblemCountRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: period.startDateKey,
            endExclusiveDateKey: period.endExclusiveDateKey,
        }),
        getVocabularyScoreRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: period.startDateKey,
            endExclusiveDateKey: period.endExclusiveDateKey,
        }),
        getAccuracyRanking({
            classroomId: classroom.id,
            timeZone,
            startDateKey: period.startDateKey,
            endExclusiveDateKey: period.endExclusiveDateKey,
        }),
    ]);

    return {
        classroom,
        timeZone,
        period: {
            key: period.key,
            label: period.label,
            startMonth: period.startMonth,
            endMonth: period.endMonth,
        },
        problemCount,
        vocabularyScore,
        accuracy,
    };
}

export async function getLegacyClassroomRankingPayload(params: {
    actorUserId: string;
    actorRole: string;
    requestedClassroomId?: string | null;
    timeZone?: string | null;
    now?: Date;
}): Promise<LegacyRankingResponse> {
    const actorRole = asRankingRole(params.actorRole);
    const timeZone = normalizeTimeZone(params.timeZone);
    const classroom = await resolveClassroomForActor({
        actorUserId: params.actorUserId,
        actorRole,
        requestedClassroomId: params.requestedClassroomId,
    });
    const periodRanges = buildLegacyPeriodRanges(timeZone, params.now ?? new Date());

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
