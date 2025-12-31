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

function normalizeStampCard(metadata: any): StampCard {
    const stampCard = metadata?.stampCard || {};
    return {
        totalStamps: stampCard.totalStamps || 0,
        lastSeenStamps: stampCard.lastSeenStamps || 0,
    };
}

export async function getStampDataForUser(userId: string): Promise<StampData | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true },
    });

    if (!user) return null;

    const metadata = (user.metadata as any) || {};
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

    const metadata = (user.metadata as any) || {};
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

    const metadata = (user.metadata as any) || {};
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
