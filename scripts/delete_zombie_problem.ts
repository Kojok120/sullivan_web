
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Delete specifically this orphan problem
    const { count } = await prisma.problem.deleteMany({
        where: {
            question: "I ( ) a student.",
            coreProblems: {
                none: {} // Ensure we only delete if it's truly orphaned (safety check)
            }
        }
    });

    console.log(`Deleted ${count} orphan problems.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
