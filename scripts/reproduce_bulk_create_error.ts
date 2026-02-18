
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Get Subject (English)
    const subject = await prisma.subject.findFirst({
        where: { name: '英語' }
    });
    if (!subject) throw new Error("No subject found");

    // 2. Get CoreProblem
    const coreProblem = await prisma.coreProblem.findFirst({
        where: { subjectId: subject.id }
    });
    if (!coreProblem) throw new Error("No CoreProblem found");

    // 3. Mimic bulk logic
    console.log(`Subject: ${subject.name}, Prefix should be E`);

    // Logic from actions.ts
    const prefix = 'E'; // Hardcoded for English

    // Find existing custom IDs
    const allSubjectProblems = await prisma.problem.findMany({
        where: {
            customId: { startsWith: prefix + '-' }
        },
        select: { customId: true }
    });

    let maxNum = 0;
    for (const p of allSubjectProblems) {
        if (p.customId) {
            const parts = p.customId.split('-');
            if (parts.length === 2) {
                const num = parseInt(parts[1], 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        }
    }

    let nextNum = maxNum;
    const problems = [{
        question: "I ( ) a student.",
        answer: "am",
        coreProblemIds: [coreProblem.id]
    }];

    // Transaction
    try {
        await prisma.$transaction(async (tx) => {
            for (const p of problems) {
                nextNum++;
                const customId = `${prefix}-${nextNum}`;
                console.log(`Creating with customId: ${customId}`);

                await tx.problem.create({
                    data: {
                        question: p.question,
                        answer: p.answer,
                        customId: customId,
                        order: nextNum,
                        coreProblems: {
                            connect: p.coreProblemIds.map(id => ({ id }))
                        }
                    }
                });
            }
        });
        console.log("Success!");
    } catch (e: unknown) {
        const err = e as { code?: unknown; message?: unknown; meta?: unknown };
        console.error("Caught Error:");
        console.error("Code:", err.code);
        console.error("Message:", err.message);
        console.error("Meta:", err.meta);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
