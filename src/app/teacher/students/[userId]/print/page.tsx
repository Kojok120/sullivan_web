import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharedStudentPrintPage } from '@/components/print/shared-student-print-page';
import { canAccessUserWithinClassroomScope } from '@/lib/authorization';

export default async function PrintPage({
    params,
    searchParams,
}: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ subjectId?: string; coreProblemId?: string; sets?: string }>;
}) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'HEAD_TEACHER' && session.role !== 'ADMIN')) {
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
            userId={userId}
            searchParams={await searchParams}
            redirectPathIfMissing={`/teacher/students/${userId}`}
        />
    );
}
