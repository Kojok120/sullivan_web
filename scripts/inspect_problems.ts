
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for any problems containing 'student'...");

    // Find ALL problems with this question, regardless of connections
    const problems = await prisma.problem.findMany({
        where: {
            question: {
                contains: 'student',
                mode: 'insensitive'
            }
        },
        include: {
            coreProblems: {
                select: { id: true, name: true }
            }
        }
    });

    console.log(`Found ${problems.length} problems.`);
    console.log(JSON.stringify(problems, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
