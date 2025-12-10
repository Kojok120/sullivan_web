
import { prisma } from '../src/lib/prisma';
import { calculateCoreProblemStatus } from '../src/lib/progression';

async function checkUnlockStatus() {
    const userId = "cmizbu15r0000jaw8k1aze4bn";
    const coreProblemId = "cmizllf9m000bjaw80qmysq38"; // be動詞の文_肯定文 (Order 1)

    // 1. Get All Problems in this CoreProblem
    const cp = await prisma.coreProblem.findUnique({
        where: { id: coreProblemId },
        include: { problems: true }
    });

    if (!cp) throw new Error("CP not found");

    const totalProblems = cp.problems.length;
    const problemIds = cp.problems.map(p => p.id);

    // 2. Get User Stats for these problems
    // We check UserProblemState or LearningHistory.
    // Assuming UserProblemState is the source of truth for "has solved".
    const userStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: problemIds }
        }
    });

    // "answeredCount" in progression.ts: "Number of unique problems answered (at least once)"
    // Check if `isAnswered` flag exists or use attempts.
    // Let's assume record existence matches answered if we only create on answer.
    const answeredCountCalc = userStates.length;

    // Correct Count: "Number of unique problems answered correctly (isCleared=true)"
    const correctCount = userStates.filter(s => s.isCleared).length;

    console.log(`CoreProblem: ${cp.name}`);
    console.log(`Total Problems: ${totalProblems}`);
    console.log(`User Answered (Unique): ${answeredCountCalc}`);
    console.log(`User Correct (Unique): ${correctCount}`);

    const status = calculateCoreProblemStatus(totalProblems, answeredCountCalc, correctCount);
    console.log("Calculated Status:", status);

}

checkUnlockStatus();
