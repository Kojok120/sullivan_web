import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UnitFocusListClient } from "./components/unit-focus-list-client";
import { normalizeLectureVideos } from "@/lib/lecture-videos";
import { getUnlockedCoreProblemIds } from "@/lib/progression";

export default async function UnitFocusPage() {
    const session = await getSession();
    if (!session) redirect("/login");

    // Fetch Subjects with CoreProblems and User States
    const subjectsRaw = await prisma.subject.findMany({
        orderBy: { order: 'asc' },
        include: {
            coreProblems: {
                orderBy: [{ order: 'asc' }, { id: 'asc' }],
            }
        }
    });

    const unlockedPairs = await Promise.all(
        subjectsRaw.map(async (subject) => {
            const unlockedIds = await getUnlockedCoreProblemIds(session.userId, subject.id);
            return [subject.id, unlockedIds] as const;
        })
    );
    const unlockedBySubject = new Map(unlockedPairs);

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
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    単元集中学習
                </h1>
                <p className="text-muted-foreground text-lg">
                    苦手な単元や復習したい単元を選んで、講義動画の視聴や問題演習ができます。
                </p>
            </div>

            <UnitFocusListClient subjects={subjects} />
        </div>
    );
}
