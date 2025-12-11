
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Find a CoreProblem to attach to (e.g. English Be-verb)
    const coreProblem = await prisma.coreProblem.findFirst({
        where: { name: { contains: 'be動詞' } }
    });

    if (!coreProblem) {
        console.error("No CoreProblem found to attach to.");
        return;
    }

    console.log(`Attaching to CoreProblem: ${coreProblem.name} (${coreProblem.id})`);

    const problemData = {
        question: "I ( ) a student.",
        answer: "am",
        order: 999,
        coreProblems: {
            connect: { id: coreProblem.id }
        }
    };

    try {
        const result = await prisma.problem.create({
            data: problemData
        });
        console.log("Successfully created problem:", result.id);
    } catch (e) {
        console.error("Failed to create problem:", e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
