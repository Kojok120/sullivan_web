import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UnitFocusListClient } from "./components/unit-focus-list-client";
import { normalizeLectureVideos } from "@/lib/lecture-videos";
import { getUnlockedCoreProblemIdsBySubject } from "@/lib/progression";

export default async function UnitFocusPage() {
    const session = await getSession();
    if (!session) redirect("/login");
    const t = await getTranslations('UnitFocus');

    // 教科と CoreProblem を取得
    const subjectsRaw = await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        include: {
            coreProblems: {
                orderBy: [{ order: 'asc' }, { id: 'asc' }],
            }
        }
    });

    const unlockedBySubject = await getUnlockedCoreProblemIdsBySubject(
        session.userId,
        subjectsRaw.map((subject) => ({
            subjectId: subject.id,
            coreProblems: subject.coreProblems.map((cp) => ({
                id: cp.id,
                order: cp.order,
            })),
        }))
    );

    const subjects = subjectsRaw.map(s => ({
        ...s,
        coreProblems: s.coreProblems.map(cp => ({
            ...cp,
            lectureVideos: normalizeLectureVideos(cp.lectureVideos),
            isUnlocked: unlockedBySubject.get(s.id)?.has(cp.id) ?? false,
        }))
    }));

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl">
            <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {t('title')}
                </h1>
                <p className="text-muted-foreground text-lg">
                    {t('description')}
                </p>
            </div>

            <UnitFocusListClient subjects={subjects} />
        </div>
    );
}
