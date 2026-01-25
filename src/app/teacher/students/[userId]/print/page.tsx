import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintDataFromParams } from '@/lib/print-service';

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
    const data = await getPrintDataFromParams(userId, await searchParams);

    if (!data) {
        if (!(await searchParams).subjectId) redirect(`/teacher/students/${userId}`);
        return <div>Data not found</div>;
    }
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
