import { redis } from '@/lib/redis';

const WATCH_STATE_KEY = 'sullivan:drive:watch:state';

export interface WatchState {
    channelId: string;
    resourceId: string;
    token?: string;
    expiration: number; // Unix timestamp (ms)
}

/**
 * Save the current Drive Watch state to Redis
 */
export async function saveWatchState(state: WatchState): Promise<void> {
    await redis.set(WATCH_STATE_KEY, JSON.stringify(state));
    console.log('Watch state saved:', state);
}

/**
 * Retrieve the current Drive Watch state from Redis
 */
export async function getWatchState(): Promise<WatchState | null> {
    const data = await redis.get<string>(WATCH_STATE_KEY);
    if (!data) return null;

    try {
        return typeof data === 'string' ? JSON.parse(data) : data as WatchState;
    } catch {
        console.error('Failed to parse watch state from Redis');
        return null;
    }
}

/**
 * Clear the Drive Watch state from Redis
 */
export async function clearWatchState(): Promise<void> {
    await redis.del(WATCH_STATE_KEY);
    console.log('Watch state cleared');
}
