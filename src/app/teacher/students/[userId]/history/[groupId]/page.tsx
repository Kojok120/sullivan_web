import { getSession, isTeacherOrAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionDetail } from "@/components/history/session-detail";
import { canAccessUserWithinClassroomScope } from '@/lib/authorization';

export default async function TeacherSessionDetailsPage({
    params
}: {
    params: Promise<{ userId: string; groupId: string }>
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) redirect('/login');

    const { userId, groupId } = await params;
    if (session.role !== 'ADMIN') {
        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId: userId,
        });
        if (!canAccess) {
            redirect('/teacher');
        }
    }

    return (
        <SessionDetail
            groupId={groupId}
            userId={userId}
            isTeacherView={true}
            backUrl={`/teacher/students/${userId}?tab=history`}
        />
    );
}
