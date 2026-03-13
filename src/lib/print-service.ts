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
    sets: number = 1,
    groupId?: string
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
    const historyPromise = groupId
        ? prisma.learningHistory.findMany({
            where: { userId, groupId },
            select: {
                problem: {
                    select: {
                        id: true,
                        customId: true,
                        question: true,
                        order: true,
                        subjectId: true,
                    },
                },
            },
            orderBy: { id: 'asc' },
        })
        : Promise.resolve(null);
    const problemsPromise = groupId
        ? Promise.resolve(null)
        : selectProblemsForPrint(userId, subjectId, coreProblemId, totalCount);
    const coreProblemPromise = !groupId && coreProblemId
        ? prisma.coreProblem.findUnique({
            where: { id: coreProblemId },
            select: { name: true, masterNumber: true }
        })
        : Promise.resolve(null);

    const [student, subject, histories, problems, coreProblem] = await Promise.all([
        studentPromise,
        subjectPromise,
        historyPromise,
        problemsPromise,
        coreProblemPromise
    ]);

    if (!student || !subject) {
        return null;
    }

    let printableProblems: PrintableProblem[] = [];
    let subjectName = subject.name;
    let unitToken: string | undefined;

    if (groupId) {
        if (!histories || histories.length === 0) {
            return null;
        }

        const problemSubjectIds = new Set(histories.map((history) => history.problem.subjectId));
        if (problemSubjectIds.size !== 1 || !problemSubjectIds.has(subjectId)) {
            return null;
        }

        printableProblems = histories.map((history) => ({
            id: history.problem.id,
            customId: history.problem.customId,
            question: history.problem.question,
            order: history.problem.order,
        }));
    } else {
        printableProblems = problems ?? [];
    }

    if (coreProblem) {
        subjectName = `${subject.name} - ${coreProblem.name}`;
        unitToken = encodeUnitToken(coreProblem.masterNumber) ?? undefined;
    }

    const problemSets: PrintableProblem[][] = [];
    for (let index = 0; index < printableProblems.length; index += PROBLEMS_PER_SET) {
        problemSets.push(printableProblems.slice(index, index + PROBLEMS_PER_SET));
    }

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subjectName,
        problems: printableProblems, // Flattened list for backward compatibility
        problemSets, // Chunked sets
        unitToken,
    };
}
