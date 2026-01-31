import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for E-1000...');
    const problem = await prisma.problem.findUnique({
        where: {
            customId: 'E-1000',
        },
    });

    if (problem) {
        console.log('Found E-1000:', JSON.stringify(problem));
    } else {
        console.log('E-1000 NOT FOUND');
        // Try finding one that looks like it
        const candidates = await prisma.problem.findMany({
            where: { customId: { contains: '1000' } },
            take: 5
        });
        console.log('Candidates with 1000:', candidates.map(c => c.customId));
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
