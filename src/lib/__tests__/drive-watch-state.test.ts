import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
    driveWatchState: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
    },
};

vi.mock('@/lib/prisma', () => ({
    prisma: prismaMock,
}));

describe('drive-watch-state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.stubEnv('DRIVE_WATCH_STATE_KEY', 'test:watch:scope');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('save/get/clear が scopeKey 単位で動作する', async () => {
        const { saveWatchState, getWatchState, clearWatchState } = await import('@/lib/drive-watch-state');

        await saveWatchState({
            channelId: 'channel-1',
            resourceId: 'resource-1',
            token: 'token-1',
            expiration: Date.UTC(2026, 2, 9, 9, 0, 0),
        });

        expect(prismaMock.driveWatchState.upsert).toHaveBeenCalledWith({
            where: { scopeKey: 'test:watch:scope' },
            create: {
                scopeKey: 'test:watch:scope',
                channelId: 'channel-1',
                resourceId: 'resource-1',
                token: 'token-1',
                expiration: new Date(Date.UTC(2026, 2, 9, 9, 0, 0)),
            },
            update: {
                channelId: 'channel-1',
                resourceId: 'resource-1',
                token: 'token-1',
                expiration: new Date(Date.UTC(2026, 2, 9, 9, 0, 0)),
            },
        });

        prismaMock.driveWatchState.findUnique.mockResolvedValue({
            scopeKey: 'test:watch:scope',
            channelId: 'channel-1',
            resourceId: 'resource-1',
            token: 'token-1',
            expiration: new Date(Date.UTC(2026, 2, 9, 9, 0, 0)),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(getWatchState()).resolves.toEqual({
            channelId: 'channel-1',
            resourceId: 'resource-1',
            token: 'token-1',
            expiration: Date.UTC(2026, 2, 9, 9, 0, 0),
        });

        await clearWatchState();
        expect(prismaMock.driveWatchState.deleteMany).toHaveBeenCalledWith({
            where: { scopeKey: 'test:watch:scope' },
        });
    });
});
