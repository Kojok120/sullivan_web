import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
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

    // スコア順を維持（未回答問題が優先される）
    // customIdソートは削除 - 学習効果を最大化するため

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subject.name,
        problems
    };
}
