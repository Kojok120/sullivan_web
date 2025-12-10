
import { prisma } from '../src/lib/prisma';

async function main() {
    const idToCheck = 'E-7';
    const problem = await prisma.problem.findFirst({
        where: { customId: idToCheck }
    });
    console.log(`Searching for ${idToCheck}:`, problem ? 'FOUND' : 'NOT FOUND');

    const idToCheckWithA = 'E-7.A';
    const problemA = await prisma.problem.findFirst({
        where: { customId: idToCheckWithA }
    });
    console.log(`Searching for ${idToCheckWithA}:`, problemA ? 'FOUND' : 'NOT FOUND');
}

main();
