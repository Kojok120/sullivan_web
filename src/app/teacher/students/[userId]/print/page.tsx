import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharedStudentPrintPage } from '@/components/print/shared-student-print-page';
import { canAccessUserWithinClassroomScope } from '@/lib/authorization';

export default async function PrintPage({
    params,
    searchParams,
}: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ subjectId?: string; coreProblemId?: string; sets?: string; autoprint?: string }>;
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        redirect('/login');
    }

    const { userId } = await params;
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
        <SharedStudentPrintPage
            searchParams={await searchParams}
            redirectPathIfMissing={`/teacher/students/${userId}`}
            targetUserIdForApi={userId}
        />
    );
}
