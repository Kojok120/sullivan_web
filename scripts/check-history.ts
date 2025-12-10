
import { prisma } from '../src/lib/prisma';

async function main() {
    const userId = 'cmizbu15r0000jaw8k1aze4bn';
    const count = await prisma.learningHistory.count({
        where: { userId: userId },
    });
    console.log(`LearningHistory count for ${userId}: ${count}`);
}
main();
