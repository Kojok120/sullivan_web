
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const problems = await prisma.problem.findMany({
        where: {
            customId: { not: null }
        },
        select: { customId: true, question: true }
    });

    console.log(`Total non-null CustomIDs: ${problems.length}`);
    console.log(JSON.stringify(problems, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
