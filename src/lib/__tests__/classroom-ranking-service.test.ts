import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { getClassroomRankingPayload, RankingServiceError, resolveRankingPeriod } from '@/lib/classroom-ranking-service';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        classroom: {
            findUnique: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}));

function getSqlText(query: unknown): string {
    if (Array.isArray(query)) {
        return query.join(' ');
    }

    if (
        query &&
        typeof query === 'object' &&
        'strings' in query &&
        Array.isArray((query as { strings: unknown }).strings)
    ) {
        return ((query as { strings: string[] }).strings).join(' ');
    }

    return String(query);
}

describe('classroom-ranking-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            classroomId: 'classroom-1',
            classroom: {
                id: 'classroom-1',
                name: '渋谷教室',
            },
        } as never);
    });

    it('今月基準で 1m / 3m / 12m の月レンジを解決する', () => {
        const now = new Date('2026-04-12T00:00:00Z');

        expect(resolveRankingPeriod({
            periodKey: '1m',
            timeZone: 'Asia/Tokyo',
            now,
        })).toMatchObject({
            key: '1m',
            startMonth: '2026-04',
            endMonth: '2026-04',
            startDateKey: '2026-04-01',
            endExclusiveDateKey: '2026-05-01',
        });

        expect(resolveRankingPeriod({
            periodKey: '3m',
            timeZone: 'Asia/Tokyo',
            now,
        })).toMatchObject({
            key: '3m',
            startMonth: '2026-02',
            endMonth: '2026-04',
            startDateKey: '2026-02-01',
            endExclusiveDateKey: '2026-05-01',
        });

        expect(resolveRankingPeriod({
            periodKey: '12m',
            timeZone: 'Asia/Tokyo',
            now,
        })).toMatchObject({
            key: '12m',
            startMonth: '2025-05',
            endMonth: '2026-04',
            startDateKey: '2025-05-01',
            endExclusiveDateKey: '2026-05-01',
        });
    });

    it('custom で単月と複数月の期間を解決する', () => {
        expect(resolveRankingPeriod({
            periodKey: 'custom',
            startMonth: '2026-04',
            endMonth: '2026-04',
            timeZone: 'Asia/Tokyo',
        })).toMatchObject({
            key: 'custom',
            label: '2026-04',
            startMonth: '2026-04',
            endMonth: '2026-04',
            startDateKey: '2026-04-01',
            endExclusiveDateKey: '2026-05-01',
        });

        expect(resolveRankingPeriod({
            periodKey: 'custom',
            startMonth: '2026-01',
            endMonth: '2026-03',
            timeZone: 'Asia/Tokyo',
        })).toMatchObject({
            key: 'custom',
            label: '2026-01〜2026-03',
            startMonth: '2026-01',
            endMonth: '2026-03',
            startDateKey: '2026-01-01',
            endExclusiveDateKey: '2026-04-01',
        });
    });

    it('custom の不正な指定を 400 エラーにする', () => {
        expect(() => resolveRankingPeriod({
            periodKey: 'custom',
            timeZone: 'Asia/Tokyo',
        })).toThrowError(new RankingServiceError(400, '自由指定では開始月と終了月を指定してください'));

        expect(() => resolveRankingPeriod({
            periodKey: 'custom',
            startMonth: '2026-13',
            endMonth: '2026-04',
            timeZone: 'Asia/Tokyo',
        })).toThrowError(new RankingServiceError(400, '開始月または終了月の形式が不正です'));

        expect(() => resolveRankingPeriod({
            periodKey: 'custom',
            startMonth: '2026-05',
            endMonth: '2026-04',
            timeZone: 'Asia/Tokyo',
        })).toThrowError(new RankingServiceError(400, '開始月は終了月以前を指定してください'));

        expect(() => resolveRankingPeriod({
            periodKey: 'custom',
            startMonth: '2025-04',
            endMonth: '2026-04',
            timeZone: 'Asia/Tokyo',
        })).toThrowError(new RankingServiceError(400, '自由指定は最大12ヶ月までです'));
    });

    it('正答率ランキングを含む単一レンジの payload を返す', async () => {
        vi.mocked(prisma.$queryRaw).mockImplementation(((query: unknown) => {
            const sql = getSqlText(query);

            if (sql.includes('ROUND(SUM(CASE WHEN lh.evaluation IN')) {
                return Promise.resolve([
                    {
                        userId: 'student-1',
                        name: '青木',
                        loginId: 'aoki',
                        group: 'A',
                        value: 90,
                        answerCount: 20,
                    },
                    {
                        userId: 'student-2',
                        name: '井上',
                        loginId: 'inoue',
                        group: 'A',
                        value: 90,
                        answerCount: 12,
                    },
                    {
                        userId: 'student-3',
                        name: '上田',
                        loginId: 'ueda',
                        group: 'B',
                        value: 80,
                        answerCount: 30,
                    },
                ]) as never;
            }

            if (sql.includes('FROM "VocabularyGameScore" vgs')) {
                return Promise.resolve([
                    {
                        userId: 'student-4',
                        name: '遠藤',
                        loginId: 'endo',
                        group: 'B',
                        value: 1200,
                    },
                ]) as never;
            }

            return Promise.resolve([
                {
                    userId: 'student-1',
                    name: '青木',
                    loginId: 'aoki',
                    group: 'A',
                    value: 15,
                },
                {
                    userId: 'student-2',
                    name: '井上',
                    loginId: 'inoue',
                    group: 'A',
                    value: 12,
                },
            ]) as never;
        }) as typeof prisma.$queryRaw);

        const payload = await getClassroomRankingPayload({
            actorUserId: 'teacher-1',
            actorRole: 'TEACHER',
            timeZone: 'Asia/Tokyo',
            periodKey: '3m',
            now: new Date('2026-04-12T00:00:00Z'),
        });

        expect(payload.classroom).toEqual({
            id: 'classroom-1',
            name: '渋谷教室',
        });
        expect(payload.period).toEqual({
            key: '3m',
            label: '2026-02〜2026-04',
            startMonth: '2026-02',
            endMonth: '2026-04',
        });
        expect(payload.problemCount).toEqual([
            {
                rank: 1,
                userId: 'student-1',
                name: '青木',
                loginId: 'aoki',
                group: 'A',
                value: 15,
            },
            {
                rank: 2,
                userId: 'student-2',
                name: '井上',
                loginId: 'inoue',
                group: 'A',
                value: 12,
            },
        ]);
        expect(payload.accuracy).toEqual([
            {
                rank: 1,
                userId: 'student-1',
                name: '青木',
                loginId: 'aoki',
                group: 'A',
                value: 90,
            },
            {
                rank: 1,
                userId: 'student-2',
                name: '井上',
                loginId: 'inoue',
                group: 'A',
                value: 90,
            },
            {
                rank: 3,
                userId: 'student-3',
                name: '上田',
                loginId: 'ueda',
                group: 'B',
                value: 80,
            },
        ]);

        const accuracySql = vi.mocked(prisma.$queryRaw).mock.calls
            .map(([query]) => getSqlText(query))
            .find((sql) => sql.includes('ROUND(SUM(CASE WHEN lh.evaluation IN'));

        expect(accuracySql).toContain('HAVING COUNT(*) >=');
        expect(accuracySql).toContain('"answerCount" DESC');
    });
});
