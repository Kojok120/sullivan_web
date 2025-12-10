
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Listing all subjects...');

    const subjects = await prisma.subject.findMany({
        include: {
            coreProblems: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    subjects.forEach(s => {
        console.log(`ID: ${s.id}, Name: "${s.name}" (len: ${s.name.length}), CoreProblems: ${s.coreProblems.length}`);
        // Print char codes
        console.log(`  Char codes: ${s.name.split('').map(c => c.charCodeAt(0)).join(', ')}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
