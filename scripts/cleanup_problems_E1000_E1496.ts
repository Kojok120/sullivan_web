import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting deletion of accidental problems (E-1000 to E-1496)...');

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
            return num >= 1000 && num <= 1496;
        }
        return false;
    });

    console.log(`Found ${targetProblems.length} problems to delete.`);

    if (targetProblems.length === 0) {
        console.log('No problems found in range.');
        return;
    }

    const ids = targetProblems.map((p) => p.id);

    // Delete relations first (though cascade might handle it, manual safety is good)
    // But using deleteMany on Problem should trigger cascades if configured, 
    // or we can just use deleteMany on Problem directly if schema supports it or raw query.
    // The service has `deleteProblemsWithRelations`. I'll emulate that logic or just delete from Problem if Cascade is set.
    // Let's assume standard cascade or manual cleanup.
    // Getting `deleteProblemsWithRelations` from service might be safer if I can import it, 
    // but this is a script. I'll rely on Prisma's relation capabilities or just delete directly 
    // and let user know if it fails.
    // Actually, looking at schema earlier, relations didn't seem to have OnDelete Cascade everywhere explicitly shown in snippet?
    // I'll check schema or just try deleteMany.

    // Safe approach: Transactional delete
    try {
        await prisma.$transaction(async (tx) => {
            // Delete related LearningHistory, UserProblemState, etc.
            // Based on problem-service.ts logic
            await tx.learningHistory.deleteMany({ where: { problemId: { in: ids } } });
            await tx.userProblemState.deleteMany({ where: { problemId: { in: ids } } });
            // Clean up junction table for CoreProblem if implicit many-to-many? 
            // Prisma handles implicit m-n cleanup automatically on delete of the record.

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
