import { prisma } from '@/lib/prisma';

const WATCH_STATE_KEY = (process.env.DRIVE_WATCH_STATE_KEY || 'sullivan:drive:watch:state').trim() || 'sullivan:drive:watch:state';

export interface WatchState {
    channelId: string;
    resourceId: string;
    token?: string;
    expiration: number; // Unix timestamp (ms)
}

/**
 * 現在の Drive Watch 状態を DB に保存する。
 */
export async function saveWatchState(state: WatchState): Promise<void> {
    await prisma.driveWatchState.upsert({
        where: { scopeKey: WATCH_STATE_KEY },
        create: {
            scopeKey: WATCH_STATE_KEY,
            channelId: state.channelId,
            resourceId: state.resourceId,
            token: state.token ?? null,
            expiration: new Date(state.expiration),
        },
        update: {
            channelId: state.channelId,
            resourceId: state.resourceId,
            token: state.token ?? null,
            expiration: new Date(state.expiration),
        },
    });
    console.log(`Watch state saved (scopeKey=${WATCH_STATE_KEY}):`, state);
}

/**
 * 現在の Drive Watch 状態を DB から取得する。
 */
export async function getWatchState(): Promise<WatchState | null> {
    const state = await prisma.driveWatchState.findUnique({
        where: { scopeKey: WATCH_STATE_KEY },
    });
    if (!state) return null;

    return {
        channelId: state.channelId,
        resourceId: state.resourceId,
        token: state.token ?? undefined,
        expiration: state.expiration.getTime(),
    };
}

/**
 * 現在の Drive Watch 状態を DB から削除する。
 */
export async function clearWatchState(): Promise<void> {
    await prisma.driveWatchState.deleteMany({
        where: { scopeKey: WATCH_STATE_KEY },
    });
    console.log(`Watch state cleared (scopeKey=${WATCH_STATE_KEY})`);
}
