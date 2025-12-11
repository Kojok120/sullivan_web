
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const problemId = 'cmj1nuk2z0000jawy0xjt31lz'; // ID from previous step
    console.log(`Attempting to delete test problem: ${problemId}`);

    try {
        await prisma.problem.delete({
            where: { id: problemId }
        });
        console.log("Successfully deleted problem via Cascade.");
    } catch (e) {
        console.error("Failed to delete problem:", e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
