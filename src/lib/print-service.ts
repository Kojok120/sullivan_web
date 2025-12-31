import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { naturalSort } from '@/lib/utils';
import { Problem } from '@prisma/client';

type PrintData = {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problems: Problem[];
};

export async function getPrintData(userId: string, subjectId: string): Promise<PrintData | null> {
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
        return null;
    }

    problems.sort((a, b) => {
        const idA = a.customId || a.id;
        const idB = b.customId || b.id;
        return naturalSort(idA, idB);
    });

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subject.name,
        problems
    };
}
