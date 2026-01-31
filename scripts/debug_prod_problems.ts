import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking production data...');
    const count = await prisma.problem.count();
    console.log(`Total problems: ${count}`);

    const sampleProblems = await prisma.problem.findMany({
        where: {
            customId: {
                startsWith: 'E-',
            },
        },
        orderBy: {
            customId: 'desc',
        },
        take: 20,
        select: {
            id: true,
            customId: true,
            question: true
        }
    });

    console.log('Sample problems (descending customId):');
    sampleProblems.forEach(p => console.log(`${p.customId}: ${p.question.substring(0, 20)}...`));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
