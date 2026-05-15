import { getSession } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SessionList } from "./dashboard/components/session-list";
import { getSubjectProgress } from "@/lib/analytics";
import { History } from "lucide-react";
import { getUnseenAchievementsForUser } from '@/lib/achievement-service';
import { PrintSelector } from "@/components/print/print-selector";
import { HomeOverlays } from "./home-overlays";
import { getStampDataForUser } from '@/lib/stamp-service';
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';
import { GoalReadonlyPanel } from '@/components/goals/goal-readonly-panel';

export default async function Home() {
    const t = await getTranslations("Home");
    const session = await getSession();
    if (!session) redirect("/login");
    if (session.role === 'ADMIN') redirect('/admin');
    if (session.role === 'MATERIAL_AUTHOR') redirect('/materials/problems');
    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') redirect('/teacher');

    const [subjectProgress, goalData, stampData, unseenAchievements] = await Promise.all([
        getSubjectProgress(session.userId),
        getGoalDailyViewPayload({ studentId: session.userId, daysBefore: 0, daysAfter: 1 }),
        getStampDataForUser(session.userId),
        getUnseenAchievementsForUser(session.userId),
    ]);
    const initialStampOverlayData = stampData && stampData.newStamps > 0
        ? { total: stampData.totalStamps, newCount: stampData.newStamps }
        : null;

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <header className="mb-10">
                <HomeOverlays
                    initialStampOverlayData={initialStampOverlayData}
                    initialAchievementQueue={unseenAchievements}
                />
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
                        {t("learningHistory")}
                    </h2>
                </div>
                <SessionList userId={session.userId} />
            </section>
        </div>
    );
}
