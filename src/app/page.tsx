import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionList } from "./dashboard/components/session-list";
import { getSubjectProgress } from "@/lib/analytics";
import { History } from "lucide-react";
import { PrintSelector } from "@/components/print/print-selector";
import { StampOverlay } from "@/components/grading/stamp-overlay";
import { AchievementOverlay } from "@/components/gamification/achievement-overlay";
import { CoreProblemUnlockOverlay } from "@/components/gamification/core-problem-unlock-overlay";

export default async function Home() {
    const session = await getSession();
    if (!session) redirect("/login");

    const subjectProgress = await getSubjectProgress(session.userId);

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <header className="mb-10">
                <StampOverlay />
                <AchievementOverlay />
                <CoreProblemUnlockOverlay />
                <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
                    ホーム
                </h1>
                <p className="text-muted-foreground">
                    {session.name}さん、こんにちは
                </p>
            </header>

            <section className="mb-8">
                <PrintSelector subjects={subjectProgress} />
            </section>

            <section>
                <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        <History className="h-6 w-6" />
                        学習履歴
                    </h2>
                    <p className="text-muted-foreground">
                        これまでの学習記録です
                    </p>
                </div>
                <SessionList userId={session.userId} />
            </section>
        </div>
    );
}
