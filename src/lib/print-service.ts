import { prisma } from '@/lib/prisma';
import { selectProblemsForPrint } from '@/lib/print-algo';
import { Problem } from '@prisma/client';

type PrintData = {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problems: Problem[];
    problemSets: Problem[][];
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
            select: { name: true }
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
    if (coreProblem) {
        subjectName = `${subject.name} - ${coreProblem.name}`;
    }

    // Chunking problems into sets
    const problemSets: Problem[][] = [];
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
        problemSets // Chunked sets
    };
}

export async function getPrintDataFromParams(
    userId: string,
    searchParams: { subjectId?: string; coreProblemId?: string; sets?: string }
) {
    const { subjectId, coreProblemId, sets } = searchParams;
    if (!subjectId) return null;

    const setsCount = sets ? parseInt(sets, 10) : 1;
    const safeSets = Math.min(Math.max(setsCount, 1), 10);

    return await getPrintData(userId, subjectId, coreProblemId, safeSets);
}
