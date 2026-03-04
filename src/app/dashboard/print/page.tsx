import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SharedStudentPrintPage } from '@/components/print/shared-student-print-page';
import { getPrintGate } from '@/lib/print-gate-service';

export default async function StudentPrintPage({
    searchParams,
}: {
    searchParams: Promise<{ subjectId?: string; coreProblemId?: string; sets?: string; autoprint?: string; gateChecked?: string }>;
}) {
    const session = await getSession();
    if (!session) redirect('/login');
    if (session.role !== 'STUDENT') redirect('/dashboard');

    const params = await searchParams;
    if (params.subjectId && params.gateChecked !== '1') {
        const gate = await getPrintGate(session.userId, params.subjectId);
        if (gate.blocked) {
            const safeSets = Math.min(Math.max(Number.parseInt(params.sets ?? '1', 10) || 1, 1), 10);
            const query = new URLSearchParams({
                from: 'print',
                subjectId: params.subjectId,
                sets: String(safeSets),
            });
            if (gate.coreProblemId) {
                redirect(`/unit-focus/${gate.coreProblemId}?${query.toString()}`);
            }
            redirect(`/unit-focus?${query.toString()}`);
        }
    }

    return (
        <SharedStudentPrintPage
            searchParams={params}
            redirectPathIfMissing="/dashboard"
        />
    );
}
