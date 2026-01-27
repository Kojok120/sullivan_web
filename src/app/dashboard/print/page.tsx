import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharedStudentPrintPage } from '@/components/print/shared-student-print-page';

export default async function StudentPrintPage({
    searchParams,
}: {
    searchParams: { subjectId?: string; coreProblemId?: string; sets?: string };
}) {
    const session = await getSession();
    if (!session) redirect('/login');

    return (
        <SharedStudentPrintPage
            userId={session.userId}
            searchParams={await searchParams}
            redirectPathIfMissing="/dashboard"
        />
    );
}
