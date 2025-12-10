import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Verifying custom IDs...');

    const problems = await prisma.problem.findMany({
        take: 10,
        select: {
            id: true,
            customId: true,
            question: true,
            coreProblems: {
                select: {
                    subject: {
                        select: { name: true }
                    }
                }
            }
        }
    });

    console.log('Sample problems:');
    problems.forEach(p => {
        const subjectName = p.coreProblems[0]?.subject.name || 'Unknown';
        console.log(`[${subjectName}] ID: ${p.id}, CustomID: ${p.customId}`);
    });

    const total = await prisma.problem.count();
    const withCustomId = await prisma.problem.count({
        where: { customId: { not: null } }
    });

    console.log(`Total problems: ${total}`);
    console.log(`Problems with customId: ${withCustomId}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
