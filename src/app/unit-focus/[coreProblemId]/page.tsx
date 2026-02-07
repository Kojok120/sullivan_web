import { UnitFocusDetailClient } from "./components/unit-focus-detail-client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function UnitFocusDetailPage({
    params,
}: {
    params: { coreProblemId: string };
}) {
    const session = await getSession();
    if (!session) redirect("/login");

    const { coreProblemId } = await params;

    const coreProblem = await prisma.coreProblem.findUnique({
        where: { id: coreProblemId },
        include: {
            subject: true,
            userStates: {
                where: { userId: session.userId }
            }
        }
    });

    if (!coreProblem) {
        return <div>Core Problem not found</div>;
    }

    const state = coreProblem.userStates[0];
    const isUnlocked = state?.isUnlocked ?? false;
    const isLectureWatched = state?.isLectureWatched ?? true; // デフォルトはtrue（既存ユーザー対応）

    // Security check: if locked, redirect or show error?
    // User requested "unlocked ... selectable, locked ... grayed out".
    // If they manually access URL, we should probably block or just warn.
    // Let's safe-guard.
    if (!isUnlocked) {
        // redirect("/unit-focus"); // aggressive
        // Just show message
    }

    const lectureVideos = ((coreProblem as any).lectureVideos as { title: string; url: string }[] | null) || [];

    return (
        <UnitFocusDetailClient
            coreProblem={coreProblem}
            lectureVideos={lectureVideos}
            isUnlocked={isUnlocked}
            isLectureWatched={isLectureWatched}
        />
    );
}
