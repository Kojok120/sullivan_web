import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionList } from "./dashboard/components/session-list";
import { getSubjectProgress } from "@/lib/analytics";
import { History } from "lucide-react";
import { PrintSelector } from "@/components/print/print-selector";
import { StampOverlay } from "@/components/grading/stamp-overlay";
import { AchievementOverlay } from "@/components/gamification/achievement-overlay";
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';
import { GoalReadonlyPanel } from '@/components/goals/goal-readonly-panel';

export default async function Home() {
    const session = await getSession();
    if (!session) redirect("/login");

    const [subjectProgress, goalData] = await Promise.all([
        getSubjectProgress(session.userId),
        getGoalDailyViewPayload({ studentId: session.userId }),
    ]);

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <header className="mb-10">
                <StampOverlay />
                <AchievementOverlay />
            </header>

            <section className="mb-8">
                <GoalReadonlyPanel
                    studentId={session.userId}
                    initialData={goalData}
                    showTomorrow
                    showTimeline={false}
                    className="mb-6"
                />
            </section>

            <section className="mb-8">
                <PrintSelector subjects={subjectProgress} />
            </section>

            <section>
                <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        <History className="h-6 w-6" />
                        学習履歴
                    </h2>
                </div>
                <SessionList userId={session.userId} />
            </section>
        </div>
    );
}
