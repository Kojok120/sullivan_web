import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintData } from '@/lib/print-service';

export default async function StudentPrintPage({
    searchParams,
}: {
    searchParams: { subjectId?: string; coreProblemId?: string };
}) {
    const session = await getSession();
    if (!session) redirect('/login');

    const { subjectId, coreProblemId } = await searchParams;

    if (!subjectId) {
        redirect('/dashboard');
    }

    const data = await getPrintData(session.userId, subjectId, coreProblemId);
    if (!data) {
        return <div>Data not found</div>;
    }

    return (
        <PrintLayout
            studentName={data.studentName}
            subjectName={data.subjectName}
            problems={data.problems}
            studentLoginId={data.studentLoginId}
        />
    );
}
