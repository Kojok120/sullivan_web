'use server';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toMetadataObject } from '@/lib/metadata-utils';

export type LevelData = {
    currentLevel: number;
    lastSeenLevel: number;
};

export async function getLevelData(): Promise<LevelData | null> {
    const session = await getSession();
    if (!session) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { level: true, metadata: true },
    });

    if (!user) return null;

    const metadata = toMetadataObject(user.metadata);
    let lastSeenLevel = typeof metadata.lastSeenLevel === 'number'
        ? metadata.lastSeenLevel
        : undefined;

    // Lazy Initialization:
    // If lastSeenLevel is missing, it means this feature is new for the user.
    // To avoid celebrating "Level 1 -> Level 10" immediately on login without a real level-up event,
    // we set lastSeenLevel = currentLevel so they don't see an animation yet.
    if (typeof lastSeenLevel !== 'number') {
        lastSeenLevel = user.level;

        // Silently update DB so next time we have a baseline
        await prisma.user.update({
            where: { id: session.userId },
            data: {
                metadata: {
                    ...metadata,
                    lastSeenLevel: user.level
                }
            }
        });
    }

    return {
        currentLevel: user.level,
        lastSeenLevel: lastSeenLevel,
    };
}

export async function markLevelAsSeen(level: number): Promise<void> {
    const session = await getSession();
    if (!session) return;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true },
    });

    if (!user) return;

    const metadata = toMetadataObject(user.metadata);
    const currentLastSeenLevel = typeof metadata.lastSeenLevel === 'number'
        ? metadata.lastSeenLevel
        : 0;

    // Only update if the new validated level is higher than what we have stored
    if (level > currentLastSeenLevel) {
        await prisma.user.update({
            where: { id: session.userId },
            data: {
                metadata: {
                    ...metadata,
                    lastSeenLevel: level,
                },
            },
        });
    }
}
