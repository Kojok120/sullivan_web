import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting deletion of problems (E-1497 to E-1983) in DEV...');

    // Find IDs to delete first to confirm
    const problems = await prisma.problem.findMany({
        where: {
            customId: {
                startsWith: 'E-',
            },
        },
        select: {
            id: true,
            customId: true,
        },
    });

    const targetProblems = problems.filter((p) => {
        if (!p.customId) return false;
        const match = p.customId.match(/^E-(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            return num >= 1497 && num <= 1983;
        }
        return false;
    });

    console.log(`Found ${targetProblems.length} problems to delete.`);

    if (targetProblems.length === 0) {
        console.log('No problems found in range.');
        return;
    }

    const ids = targetProblems.map((p) => p.id);

    try {
        await prisma.$transaction(async (tx) => {
            // Delete related records
            await tx.learningHistory.deleteMany({ where: { problemId: { in: ids } } });
            await tx.userProblemState.deleteMany({ where: { problemId: { in: ids } } });

            const deleted = await tx.problem.deleteMany({
                where: { id: { in: ids } },
            });
            console.log(`Deleted ${deleted.count} problems.`);
        });
    } catch (e) {
        console.error('Error deleting problems:', e);
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
