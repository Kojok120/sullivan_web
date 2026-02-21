import { UnitFocusDetailClient } from "./components/unit-focus-detail-client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { normalizeLectureVideos } from "@/lib/lecture-videos";
import { getUnlockedCoreProblemIds } from "@/lib/progression";

export default async function UnitFocusDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ coreProblemId: string }>;
    searchParams: Promise<{ from?: string; subjectId?: string; sets?: string }>;
}) {
    const session = await getSession();
    if (!session) redirect("/login");

    const { coreProblemId } = await params;
    const query = await searchParams;

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

    const unlockedCoreProblemIds = await getUnlockedCoreProblemIds(session.userId, coreProblem.subjectId);
    const entryCoreProblem = await prisma.coreProblem.findFirst({
        where: { subjectId: coreProblem.subjectId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true },
    });

    const state = coreProblem.userStates[0];
    const isUnlocked = unlockedCoreProblemIds.has(coreProblem.id);
    const lectureVideos = normalizeLectureVideos(coreProblem.lectureVideos);
    const hasVideos = lectureVideos.length > 0;
    const isEntryCoreProblem = entryCoreProblem?.id === coreProblem.id;
    // 最初の単元は無条件アンロック仕様のため、state未作成時も視聴済みとして扱う
    const isLectureWatched = !hasVideos ? true : (state?.isLectureWatched ?? isEntryCoreProblem);

    const fromPrint = query.from === 'print';
    const returnSubjectId = query.subjectId;
    const rawSets = Number.parseInt(query.sets ?? '1', 10);
    const safeSets = Number.isFinite(rawSets) ? Math.min(Math.max(rawSets, 1), 10) : 1;
    const returnToPrintUrl = fromPrint && returnSubjectId
        ? `/dashboard/print?subjectId=${encodeURIComponent(returnSubjectId)}&sets=${safeSets}`
        : null;

    return (
        <UnitFocusDetailClient
            coreProblem={coreProblem}
            lectureVideos={lectureVideos}
            isUnlocked={isUnlocked}
            isLectureWatched={isLectureWatched}
            fromPrint={fromPrint}
            returnToPrintUrl={returnToPrintUrl}
        />
    );
}
