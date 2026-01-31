import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Counting problems with customId: null ...');
    const count = await prisma.problem.count({
        where: {
            customId: null
        }
    });
    console.log(`Found ${count} problems to delete.`);

    if (count === 0) {
        console.log('Nothing to delete.');
        return;
    }

    // Delete execution
    // Note: relations (histories, userStates) should cascade if defined in schema, 
    // or we might need transaction if they don't.
    // In `check_E1000` step we saw the user wanted to delete them.
    // Let's try deleteMany. If it fails due to foreign key constraint, we will know.
    // Usually Application level delete handles relations, but this is a script.
    // Let's use a transaction to be safe and try to delete related first if possible,
    // but `deleteMany` inside transaction with relations is tricky without IDs.

    // Strategy: Fetch IDs, delete relations, then delete problems.
    const problems = await prisma.problem.findMany({
        where: { customId: null },
        select: { id: true }
    });
    const ids = problems.map(p => p.id);

    try {
        await prisma.$transaction(async (tx) => {
            // Delete related records just in case cascade isn't set up or to be safe
            const historyDel = await tx.learningHistory.deleteMany({ where: { problemId: { in: ids } } });
            console.log(`Deleted ${historyDel.count} related histories.`);

            const stateDel = await tx.userProblemState.deleteMany({ where: { problemId: { in: ids } } });
            console.log(`Deleted ${stateDel.count} related user states.`);

            const deleted = await tx.problem.deleteMany({
                where: {
                    id: { in: ids }
                }
            });
            console.log(`Deleted ${deleted.count} problems.`);
        });
    } catch (e) {
        console.error('Delete failed, trying simple deleteMany...', e);
        // Fallback
        const deleted = await prisma.problem.deleteMany({
            where: { customId: null }
        });
        console.log(`Deleted ${deleted.count} problems (fallback).`);
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
