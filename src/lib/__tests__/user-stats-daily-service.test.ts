import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
    listUtcDates,
    readForUserDateRange,
    recomputeAllForDateRange,
    recomputeForUserDateRange,
    startOfUtcDate,
} from '@/lib/user-stats-daily-service';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        userStatsDaily: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    },
}));

describe('user-stats-daily-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('startOfUtcDate', () => {
        it('UTC 0:00 に切り捨てる', () => {
            const result = startOfUtcDate(new Date('2026-05-06T15:30:45.123Z'));
            expect(result.toISOString()).toBe('2026-05-06T00:00:00.000Z');
        });

        it('既に UTC 0:00 ならそのままの時刻になる', () => {
            const result = startOfUtcDate(new Date('2026-05-06T00:00:00.000Z'));
            expect(result.toISOString()).toBe('2026-05-06T00:00:00.000Z');
        });

        it('入力 Date を破壊的変更しない', () => {
            const input = new Date('2026-05-06T15:30:00.000Z');
            const inputBefore = input.toISOString();
            startOfUtcDate(input);
            expect(input.toISOString()).toBe(inputBefore);
        });
    });

    describe('listUtcDates', () => {
        it('複数日の UTC 日付配列を返す（to は exclusive）', () => {
            const dates = listUtcDates(
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-04T00:00:00.000Z'),
            );
            expect(dates.map((d) => d.toISOString())).toEqual([
                '2026-05-01T00:00:00.000Z',
                '2026-05-02T00:00:00.000Z',
                '2026-05-03T00:00:00.000Z',
            ]);
        });

        it('from === to なら空配列を返す', () => {
            const dates = listUtcDates(
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(dates).toEqual([]);
        });

        it('from > to なら空配列を返す', () => {
            const dates = listUtcDates(
                new Date('2026-05-04T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(dates).toEqual([]);
        });

        it('時刻成分があっても UTC 0:00 に正規化された配列を返す', () => {
            const dates = listUtcDates(
                new Date('2026-05-01T15:30:00.000Z'),
                new Date('2026-05-03T08:00:00.000Z'),
            );
            expect(dates.map((d) => d.toISOString())).toEqual([
                '2026-05-01T00:00:00.000Z',
                '2026-05-02T00:00:00.000Z',
            ]);
        });
    });

    describe('recomputeForUserDateRange', () => {
        it('範囲が空の場合は SQL を発行せず 0 を返す', async () => {
            const result = await recomputeForUserDateRange(
                'user-1',
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(result).toBe(0);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('正しい範囲で $transaction（delete + insert）を呼び insert 件数を返す', async () => {
            // $transaction は配列形式で [deleteMany結果, $executeRaw結果] を返す
            vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, 3] as never);
            const result = await recomputeForUserDateRange(
                'user-1',
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-04T00:00:00.000Z'),
            );
            expect(result).toBe(3);
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            // transaction 内では deleteMany と $executeRaw が組み立てられる
            expect(prisma.userStatsDaily.deleteMany).toHaveBeenCalledTimes(1);
            expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
        });

        it('from > to の場合は SQL を発行しない（idempotent な早期 return）', async () => {
            const result = await recomputeForUserDateRange(
                'user-1',
                new Date('2026-05-10T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(result).toBe(0);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('recomputeAllForDateRange', () => {
        it('期間内に学習履歴のあるユーザがいない場合は何もしない', async () => {
            vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
            const result = await recomputeAllForDateRange(
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-02T00:00:00.000Z'),
            );
            expect(result).toEqual({ users: 0, rows: 0 });
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('範囲が空なら $queryRaw も呼ばない', async () => {
            const result = await recomputeAllForDateRange(
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(result).toEqual({ users: 0, rows: 0 });
            expect(prisma.$queryRaw).not.toHaveBeenCalled();
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('対象ユーザを batchSize 単位で処理し、合計を返す', async () => {
            vi.mocked(prisma.$queryRaw).mockResolvedValue([
                { userId: 'u-1' },
                { userId: 'u-2' },
                { userId: 'u-3' },
            ] as never);
            vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, 2] as never);

            const result = await recomputeAllForDateRange(
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-04T00:00:00.000Z'),
                { batchSize: 2 },
            );

            expect(result).toEqual({ users: 3, rows: 6 });
            expect(prisma.$transaction).toHaveBeenCalledTimes(3);
        });

        it('batchSize が 0 以下なら RangeError を投げる', async () => {
            vi.mocked(prisma.$queryRaw).mockResolvedValue([{ userId: 'u-1' }] as never);
            await expect(
                recomputeAllForDateRange(
                    new Date('2026-05-01T00:00:00.000Z'),
                    new Date('2026-05-04T00:00:00.000Z'),
                    { batchSize: 0 },
                ),
            ).rejects.toThrow(RangeError);
        });
    });

    describe('readForUserDateRange', () => {
        it('範囲が空なら findMany を呼ばず空配列を返す', async () => {
            const result = await readForUserDateRange(
                'user-1',
                new Date('2026-05-01T00:00:00.000Z'),
                new Date('2026-05-01T00:00:00.000Z'),
            );
            expect(result).toEqual([]);
            expect(prisma.userStatsDaily.findMany).not.toHaveBeenCalled();
        });

        it('正規化された範囲で findMany を呼び、結果をそのまま返す', async () => {
            vi.mocked(prisma.userStatsDaily.findMany).mockResolvedValue([
                {
                    userId: 'user-1',
                    date: new Date('2026-05-01T00:00:00.000Z'),
                    totalSolved: 10,
                    correctCount: 7,
                    xpEarned: 0,
                },
                {
                    userId: 'user-1',
                    date: new Date('2026-05-02T00:00:00.000Z'),
                    totalSolved: 5,
                    correctCount: 3,
                    xpEarned: 0,
                },
            ] as never);

            const result = await readForUserDateRange(
                'user-1',
                new Date('2026-05-01T15:00:00.000Z'),
                new Date('2026-05-04T08:00:00.000Z'),
            );

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                userId: 'user-1',
                totalSolved: 10,
                correctCount: 7,
            });

            const callArg = vi.mocked(prisma.userStatsDaily.findMany).mock.calls[0]?.[0];
            expect(callArg).toBeDefined();
            const where = (callArg as { where?: { userId?: string; date?: { gte?: Date; lt?: Date } } } | undefined)?.where;
            expect(where?.userId).toBe('user-1');
            expect(where?.date?.gte?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
            expect(where?.date?.lt?.toISOString()).toBe('2026-05-04T00:00:00.000Z');
        });
    });
});
