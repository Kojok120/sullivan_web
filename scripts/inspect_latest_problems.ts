import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching latest 10 problems...');
    const problems = await prisma.problem.findMany({
        orderBy: {
            createdAt: 'desc',
        },
        take: 10,
        select: {
            id: true,
            customId: true,
            question: true,
            grade: true,
            createdAt: true
        }
    });

    console.log(`Found ${problems.length} problems.`);
    problems.forEach(p => console.log(JSON.stringify(p)));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
