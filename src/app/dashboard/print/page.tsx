import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintDataFromParams } from '@/lib/print-service';

export default async function StudentPrintPage({
    searchParams,
}: {
    searchParams: { subjectId?: string; coreProblemId?: string; sets?: string };
}) {
    const session = await getSession();
    if (!session) redirect('/login');

    const data = await getPrintDataFromParams(session.userId, await searchParams);

    if (!data) {
        if (!(await searchParams).subjectId) redirect('/dashboard');
        return <div>Data not found</div>;
    }

    return (
        <PrintLayout
            studentName={data.studentName}
            subjectName={data.subjectName}
            problems={data.problems}
            problemSets={data.problemSets}
            studentLoginId={data.studentLoginId}
        />
    );
}
