import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { PrintLayout } from './print-layout';
import { generateQRCode } from '@/lib/grading-service';

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

    const [student, subject, problems] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, loginId: true }
        }),
        prisma.subject.findUnique({
            where: { id: subjectId },
            select: { name: true }
        }),
        selectProblemsForPrint(userId, subjectId)
    ]);

    if (!student || !subject) {
        return <div>Data not found</div>;
    }

    // Generate QR Codes
    const problemsWithQR = await Promise.all(problems.map(async (p) => ({
        ...p,
        qrCodeDataUrl: await generateQRCode(userId, p.id)
    })));

    return (
        <PrintLayout
            studentName={student.name || student.loginId}
            subjectName={subject.name}
            problems={problemsWithQR}
        />
    );
}
