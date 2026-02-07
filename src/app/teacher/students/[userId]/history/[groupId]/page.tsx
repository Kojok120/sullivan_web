import { getSession, isTeacherOrAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionDetail } from "@/components/history/session-detail";

export default async function TeacherSessionDetailsPage({
    params
}: {
    params: Promise<{ userId: string; groupId: string }>
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) redirect('/login');

    const { userId, groupId } = await params;

    return (
        <SessionDetail
            groupId={groupId}
            userId={userId}
            isTeacherView={true}
            backUrl={`/teacher/students/${userId}?tab=history`}
        />
    );
}
