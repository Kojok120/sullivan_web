import { redirect } from 'next/navigation';
import { PrintLayout } from '@/components/print/print-layout';
import { getPrintDataFromParams } from '@/lib/print-service';

interface StudentPrintPageProps {
    userId: string;
    searchParams: { subjectId?: string; coreProblemId?: string; sets?: string };
    redirectPathIfMissing: string;
}

export async function SharedStudentPrintPage({ userId, searchParams, redirectPathIfMissing }: StudentPrintPageProps) {
    const data = await getPrintDataFromParams(userId, searchParams);

    if (!data) {
        if (!searchParams.subjectId) redirect(redirectPathIfMissing);
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
