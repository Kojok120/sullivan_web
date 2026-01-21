import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { Problem } from '@prisma/client';

type PrintData = {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problems: Problem[];
};

export async function getPrintData(
    userId: string,
    subjectId: string,
    coreProblemId?: string
): Promise<PrintData | null> {
    const promises: Promise<any>[] = [
        prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, loginId: true }
        }),
        prisma.subject.findUnique({
            where: { id: subjectId },
            select: { name: true }
        }),
        selectProblemsForPrint(userId, subjectId, coreProblemId)
    ];

    if (coreProblemId) {
        promises.push(
            prisma.coreProblem.findUnique({
                where: { id: coreProblemId },
                select: { name: true }
            })
        );
    }

    const results = await Promise.all(promises);
    const student = results[0];
    const subject = results[1];
    const problems = results[2];
    const coreProblem = coreProblemId ? results[3] : null;

    if (!student || !subject) {
        return null;
    }

    let subjectName = subject.name;
    if (coreProblem) {
        subjectName = `${subject.name} - ${coreProblem.name}`;
    }

    // スコア順を維持（未回答問題が優先される）
    // customIdソートは削除 - 学習効果を最大化するため

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subjectName,
        problems
    };
}
