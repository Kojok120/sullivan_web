import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintData } from '@/lib/print-service';

export default async function PrintPage({
    params,
    searchParams,
}: {
    params: { userId: string };
    searchParams: { subjectId?: string };
}) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) redirect('/login');

    const { userId } = await params;
    const { subjectId } = await searchParams;

    if (!subjectId) {
        redirect(`/teacher/students/${userId}`);
    }

    const data = await getPrintData(userId, subjectId);
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
