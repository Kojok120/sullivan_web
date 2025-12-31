import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { PrintLayout } from '@/components/print/print-layout';

export default async function StudentPrintPage({
    searchParams,
}: {
    searchParams: { subjectId?: string };
}) {
    const session = await getSession();
    if (!session) redirect('/login');

    const { subjectId } = await searchParams;

    if (!subjectId) {
        redirect('/dashboard');
    }

    const [student, subject, problems] = await Promise.all([
        prisma.user.findUnique({
            where: { id: session.userId },
            select: { name: true, loginId: true }
        }),
        prisma.subject.findUnique({
            where: { id: subjectId },
            select: { name: true }
        }),
        selectProblemsForPrint(session.userId, subjectId)
    ]);

    if (!student || !subject) {
        return <div>Data not found</div>;
    }

    // Sort by customId (Natural Sort)
    // Client-side will handle final truncation and QR generation
    const { naturalSort } = await import('@/lib/utils');
    problems.sort((a, b) => {
        const idA = a.customId || a.id;
        const idB = b.customId || b.id;
        return naturalSort(idA, idB);
    });

    return (
        <PrintLayout
            studentName={student.name || student.loginId}
            subjectName={subject.name}
            problems={problems}
            studentLoginId={student.loginId}
        />
    );
}
