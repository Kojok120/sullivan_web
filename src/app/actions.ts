"use server";

import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { processVideoWatch, toGamificationPayload } from "@/lib/gamification-service";
import { emitRealtimeEvent } from "@/lib/realtime-events";


export async function logoutAction() {
    await logout();
    redirect("/login");
}

export async function markVideoWatched(historyId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    // Verify ownership
    const record = await prisma.learningHistory.findUnique({
        where: { id: historyId },
    });

    if (!record || record.userId !== session.userId) {
        throw new Error("Not found or access denied");
    }

    await prisma.learningHistory.update({
        where: { id: historyId },
        data: { isVideoWatched: true },
    });

    // Gamification Hook
    try {
        const gamificationResult = await processVideoWatch(session.userId);
        if (gamificationResult.achievementsUnlocked.length > 0 || gamificationResult.levelUp) {
            const payload = toGamificationPayload(gamificationResult);
            await emitRealtimeEvent({
                userId: gamificationResult.userId,
                type: 'gamification_update',
                payload,
            });
        }
    } catch (e) {
        console.error("Failed to process video watch gamification:", e);
    }

    // revalidatePath('/dashboard');
}

import { getLearningSessions, markSessionAsReviewed } from "@/lib/analytics";

export async function fetchMySessions(offset: number, limit: number, filter?: { onlyUnreviewed?: boolean }) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    return await getLearningSessions(session.userId, limit, offset, filter?.onlyUnreviewed);
}

export async function markSessionReviewed(groupId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    await markSessionAsReviewed(groupId, session.userId);
}
