'use server';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toMetadataObject } from '@/lib/metadata-utils';

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
