
import { prisma } from '../src/lib/prisma';
import { getUnwatchedCount, getLearningSessions } from '../src/lib/analytics';

async function main() {
    const userId = 'cmizbu15r0000jaw8k1aze4bn'; // Mock user

    // 1. Check latest history for groupId
    const latest = await prisma.learningHistory.findFirst({
        where: { userId },
        orderBy: { answeredAt: 'desc' },
    });

    console.log('Latest History:', latest);

    if (latest?.groupId) {
        console.log('SUCCESS: groupId is populated.');
    } else {
        console.log('FAILURE: groupId is missing.');
    }

    // 2. Check Unwatched Count
    const count = await getUnwatchedCount(userId);
    console.log(`Unwatched Count for ${userId}: ${count}`);

    // 3. Check Sessions
    const sessions = await getLearningSessions(userId);
    console.log('Sessions:', sessions);
}

main();
