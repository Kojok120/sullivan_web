import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintData } from '@/lib/print-service';

export default async function PrintPage({
    params,
    searchParams,
}: {
    params: { userId: string };
    searchParams: { subjectId?: string; coreProblemId?: string; sets?: string };
}) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) redirect('/login');

    const { userId } = await params;
    const { subjectId, coreProblemId, sets } = await searchParams;

    if (!subjectId) {
        redirect(`/teacher/students/${userId}`);
    }

    const setsCount = sets ? parseInt(sets, 10) : 1;
    const safeSets = Math.min(Math.max(setsCount, 1), 10);

    const data = await getPrintData(userId, subjectId, coreProblemId, safeSets);
    if (!data) {
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
