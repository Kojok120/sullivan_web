
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Check for ANY non-null customId
    const count = await prisma.problem.count({ where: { customId: { not: null } } });
    console.log(`Non-null customIds count: ${count}`);

    // Try to create E-1 explicitly
    console.log("Attempting to create problem with customId='E-1'...");

    // Find CoreProblem
    const coreProblem = await prisma.coreProblem.findFirst({
        where: { name: { contains: 'be動詞' } }
    });

    if (!coreProblem) {
        console.error("No CoreProblem found.");
        return;
    }

    try {
        const result = await prisma.problem.create({
            data: {
                question: "Test E-1 Creation",
                answer: "test",
                customId: "E-1",
                order: 1000,
                coreProblems: { connect: { id: coreProblem.id } }
            }
        });
        console.log("Success! Created:", result.id);

        // Clean up
        await prisma.problem.delete({ where: { id: result.id } });
        console.log("Cleaned up.");
    } catch (e) {
        console.error("FAILED to create E-1:", e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
