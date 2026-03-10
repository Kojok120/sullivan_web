"use server";

import { getLearningSessions, markSessionAsReviewed } from "@/lib/analytics";
import { getSession, logout, isTeacherOrAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { processVideoWatch, toGamificationPayload } from "@/lib/gamification-service";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import { canAccessUserWithinClassroomScope } from '@/lib/authorization';


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

export async function fetchUserSessions(offset: number, limit: number, filter?: { onlyPendingVideoReview?: boolean }, targetUserId?: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    // 講師・管理者は他ユーザーのセッションを取得可能
    let userId = session.userId;
    if (targetUserId && targetUserId !== session.userId) {
        if (!isTeacherOrAdmin(session)) {
            throw new Error("Unauthorized: 他ユーザーのセッションを閲覧する権限がありません");
        }
        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId,
        });
        if (!canAccess) {
            throw new Error("Unauthorized: 担当教室外のユーザーにはアクセスできません");
        }
        userId = targetUserId;
    }

    return await getLearningSessions(userId, limit, offset, filter?.onlyPendingVideoReview);
}

export async function markSessionReviewed(groupId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    await markSessionAsReviewed(groupId, session.userId);
}
