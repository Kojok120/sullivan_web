import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { PrintLayout } from '@/components/print/print-layout';
// QR code generation might be teacher-only or we can allow it for students too.
// For now, let's keep it consistent.
import { generateQRCode } from '@/lib/grading-service';

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

    // Generate QR Code for the entire sheet
    const problemIds = problems.map(p => p.id);
    const qrCodeDataUrl = await generateQRCode(session.userId, problemIds);

    return (
        <PrintLayout
            studentName={student.name || student.loginId}
            subjectName={subject.name}
            problems={problems}
            qrCodeDataUrl={qrCodeDataUrl}
        />
    );
}
