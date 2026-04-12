import { prisma } from '@/lib/prisma';
import { createProblemAssetSignedUrl } from '@/lib/problem-assets';
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
    shuffleSeed?: string
): Promise<PrintData | null> {
    const DEFAULT_TARGET_PROBLEMS_PER_SET = 10;
    const totalCount = sets * DEFAULT_TARGET_PROBLEMS_PER_SET;

    const studentPromise = prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, loginId: true }
    });
    const subjectPromise = prisma.subject.findUnique({
        where: { id: subjectId },
        select: { name: true }
    });
    const problemsPromise = selectProblemsForPrint(userId, subjectId, coreProblemId, totalCount, shuffleSeed);
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

    const problemsWithAssets = await Promise.all(problems.map(async (problem) => ({
        ...problem,
        assets: problem.assets
            ? await Promise.all(problem.assets.map(async (asset) => ({
                ...asset,
                signedUrl: asset.storageKey ? await createProblemAssetSignedUrl(asset.storageKey) : null,
            })))
            : [],
    })));

    const problemSets = chunkProblemsForPrint(problemsWithAssets, sets);

    return {
        studentName: student.name || student.loginId,
        studentLoginId: student.loginId,
        subjectName: subjectName,
        problems: problemsWithAssets, // Flattened list for backward compatibility
        problemSets, // Chunked sets
        unitToken,
    };
}

function chunkProblemsForPrint(problems: PrintableProblem[], sets: number): PrintableProblem[][] {
    const problemsPerSet = 10;
    const maxSetCount = Math.max(1, sets);
    const chunkedProblems: PrintableProblem[][] = [];

    for (let index = 0; index < problems.length && chunkedProblems.length < maxSetCount; index += problemsPerSet) {
        chunkedProblems.push(problems.slice(index, index + problemsPerSet));
    }

    return chunkedProblems;
}
