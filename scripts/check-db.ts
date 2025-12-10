
import { prisma } from '../src/lib/prisma';

async function main() {
    const problems = await prisma.problem.findMany({
        take: 10,
        select: { id: true, customId: true, question: true }
    });
    console.log('Problems:', problems);
}
main();
