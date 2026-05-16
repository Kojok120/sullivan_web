import { UnitFocusDetailClient } from "./components/unit-focus-detail-client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
    const t = await getTranslations('UnitFocus');

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
        return <div>{t('notFound')}</div>;
    }

    const unlockedCoreProblemIds = await getUnlockedCoreProblemIds(session.userId, coreProblem.subjectId);

    const state = coreProblem.userStates[0];
    const isUnlocked = unlockedCoreProblemIds.has(coreProblem.id);
    const lectureVideos = normalizeLectureVideos(coreProblem.lectureVideos);
    const hasVideos = lectureVideos.length > 0;
    // 講義動画がある単元は、state未作成時は未視聴として扱う
    const isLectureWatched = !hasVideos ? true : (state?.isLectureWatched ?? false);

    const fromPrint = query.from === 'print';
    const returnSubjectId = query.subjectId;
    const rawSets = Number.parseInt(query.sets ?? '1', 10);
    const safeSets = Number.isFinite(rawSets) ? Math.min(Math.max(rawSets, 1), 10) : 1;
    const returnToPrintUrl = fromPrint && returnSubjectId && returnSubjectId === coreProblem.subjectId
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
