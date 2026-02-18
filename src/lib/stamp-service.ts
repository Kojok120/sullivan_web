import { prisma } from '@/lib/prisma';

export type StampData = {
    totalStamps: number;
    lastSeenStamps: number;
    newStamps: number;
};

type StampCard = {
    totalStamps: number;
    lastSeenStamps: number;
};

function toMetadataObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    return {};
}

function normalizeStampCard(metadata: Record<string, unknown>): StampCard {
    const rawStampCard = metadata.stampCard;
    const stampCard = typeof rawStampCard === 'object' && rawStampCard !== null && !Array.isArray(rawStampCard)
        ? (rawStampCard as Record<string, unknown>)
        : {};
    return {
        totalStamps: typeof stampCard.totalStamps === 'number' ? stampCard.totalStamps : 0,
        lastSeenStamps: typeof stampCard.lastSeenStamps === 'number' ? stampCard.lastSeenStamps : 0,
    };
}

export async function getStampDataForUser(userId: string): Promise<StampData | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true },
    });

    if (!user) return null;

    const metadata = toMetadataObject(user.metadata);
    const stampCard = normalizeStampCard(metadata);

    return {
        totalStamps: stampCard.totalStamps,
        lastSeenStamps: stampCard.lastSeenStamps,
        newStamps: stampCard.totalStamps - stampCard.lastSeenStamps,
    };
}

export async function incrementStampCount(userId: string, amount: number = 1): Promise<number | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true },
    });

    if (!user) return null;

    const metadata = toMetadataObject(user.metadata);
    const stampCard = normalizeStampCard(metadata);
    const newTotal = stampCard.totalStamps + amount;

    await prisma.user.update({
        where: { id: userId },
        data: {
            metadata: {
                ...metadata,
                stampCard: {
                    ...stampCard,
                    totalStamps: newTotal,
                },
            },
        },
    });

    return newTotal;
}

export async function markStampsAsSeenForUser(userId: string, newSeenCount: number): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true },
    });

    if (!user) return;

    const metadata = toMetadataObject(user.metadata);
    const stampCard = normalizeStampCard(metadata);

    if (newSeenCount > stampCard.lastSeenStamps) {
        await prisma.user.update({
            where: { id: userId },
            data: {
                metadata: {
                    ...metadata,
                    stampCard: {
                        ...stampCard,
                        lastSeenStamps: newSeenCount,
                    },
                },
            },
        });
    }
}
