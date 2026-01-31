import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting migration of masterNumber...');

    // Get all problems
    const problems = await prisma.problem.findMany({
        where: {
            masterNumber: null, // Only process those without masterNumber
            customId: { not: null } // Must have a customId
        },
        select: {
            id: true,
            customId: true
        }
    });

    console.log(`Found ${problems.length} problems to migrate.`);

    let successCount = 0;
    let failCount = 0;

    for (const problem of problems) {
        if (!problem.customId) continue;

        // Pattern: String-Number (e.g., E-1, S-10, M-100)
        // We want the number part after the last hyphen
        const match = problem.customId.match(/-(\d+)$/);

        if (match && match[1]) {
            const number = parseInt(match[1], 10);

            try {
                await prisma.problem.update({
                    where: { id: problem.id },
                    data: { masterNumber: number }
                });
                successCount++;
                // console.log(`Updated ${problem.customId} -> ${number}`);
            } catch (e) {
                console.error(`Failed to update ${problem.customId}:`, e);
                failCount++;
            }
        } else {
            console.warn(`Could not parse number from customId: ${problem.customId}`);
            failCount++;
        }
    }

    console.log(`Migration finished.`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed/Skipped: ${failCount}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
