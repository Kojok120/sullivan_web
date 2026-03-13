import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { encodeUnitToken } from '@/lib/qr-utils';
import type { PrintableProblem } from '@/lib/print-types';

type PrintData = {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problems: PrintableProblem[];
    problemSets: PrintableProblem[][];
    unitToken?: string;
};

export async function getPrintData(
    userId: string,
    subjectId: string,
    coreProblemId?: string,
    sets: number = 1
): Promise<PrintData | null> {
    const PROBLEMS_PER_SET = 10;
    const totalCount = sets * PROBLEMS_PER_SET;

    const studentPromise = prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, loginId: true }
    });
    const subjectPromise = prisma.subject.findUnique({
        where: { id: subjectId },
        select: { name: true }
    });
    const problemsPromise = selectProblemsForPrint(userId, subjectId, coreProblemId, totalCount);
    const coreProblemPromise = coreProblemId
        ? prisma.coreProblem.findUnique({
            where: { id: coreProblemId },
            select: { name: true, masterNumber: true }
        })
        : Promise.resolve(null);

    const [student, subject, problems, coreProblem] = await Promise.all([
        studentPromise,
        subjectPromise,
        problemsPromise,
        coreProblemPromise
    ]);

    if (!student || !subject) {
        return null;
    }

    let subjectName = subject.name;
    let unitToken: string | undefined;
    if (coreProblem) {
        subjectName = `${subject.name} - ${coreProblem.name}`;
        unitToken = encodeUnitToken(coreProblem.masterNumber) ?? undefined;
    }

    // Chunking problems into sets
    const problemSets: PrintableProblem[][] = [];
    for (let i = 0; i < sets; i++) {
        const start = i * PROBLEMS_PER_SET;
        const end = start + PROBLEMS_PER_SET;
        const setProblems = problems.slice(start, end);
        if (setProblems.length > 0) {
            problemSets.push(setProblems);
        }
    }

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subjectName,
        problems, // Flattened list for backward compatibility
        problemSets, // Chunked sets
        unitToken,
    };
}
