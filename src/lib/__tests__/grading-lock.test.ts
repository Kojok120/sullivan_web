import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        $queryRaw: vi.fn(),
        distributedLock: {
            deleteMany: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: prismaMock,
}));

import {
    acquireGradingFileLock,
    acquireGradingLock,
    isGradingFileLocked,
    releaseGradingFileLock,
} from '@/lib/grading-lock';

describe('grading-lock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-09T00:00:00Z'));
    });

    it('acquireGradingLock は lease を返す', async () => {
        const expiresAt = new Date('2026-03-09T00:01:00Z');
        prismaMock.$queryRaw.mockResolvedValue([
            {
                key: 'sullivan:grading:scan:lock',
                ownerId: 'lease-owner-1',
                expiresAt,
            },
        ]);

        await expect(acquireGradingLock()).resolves.toEqual({
            key: 'sullivan:grading:scan:lock',
            ownerId: 'lease-owner-1',
            expiresAt,
        });
    });

    it('競合中は null を返す', async () => {
        prismaMock.$queryRaw.mockResolvedValue([]);

        await expect(acquireGradingFileLock('file-1')).resolves.toBeNull();
    });

    it('releaseGradingFileLock は ownerId 一致条件で解放する', async () => {
        await releaseGradingFileLock({
            key: 'sullivan:grading:file:file-1',
            ownerId: 'lease-owner-1',
            expiresAt: new Date('2026-03-09T00:15:00Z'),
        });

        expect(prismaMock.distributedLock.deleteMany).toHaveBeenCalledWith({
            where: {
                key: 'sullivan:grading:file:file-1',
                ownerId: 'lease-owner-1',
            },
        });
    });

    it('isGradingFileLocked は有効期限で判定する', async () => {
        prismaMock.distributedLock.findUnique
            .mockResolvedValueOnce({ expiresAt: new Date('2026-03-09T00:10:00Z') })
            .mockResolvedValueOnce({ expiresAt: new Date('2026-03-08T23:59:59Z') });

        await expect(isGradingFileLocked('file-1')).resolves.toBe(true);
        await expect(isGradingFileLocked('file-1')).resolves.toBe(false);
    });
});
