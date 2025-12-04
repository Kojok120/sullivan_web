import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting backfill of custom IDs...');

    // Fetch all subjects
    const subjects = await prisma.subject.findMany();

    for (const subject of subjects) {
        let prefix = '';
        if (subject.name.includes('英語')) prefix = 'E';
        else if (subject.name.includes('国語')) prefix = 'J';
        else if (subject.name.includes('数学')) prefix = 'S';
        else {
            // Default or fallback
            prefix = subject.name.charAt(0).toUpperCase();
        }

        console.log(`Processing subject: ${subject.name} (Prefix: ${prefix})`);

        // Fetch all problems for this subject, ordered by creation time
        const problems = await prisma.problem.findMany({
            where: {
                coreProblem: {
                    unit: {
                        subjectId: subject.id
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        console.log(`Found ${problems.length} problems.`);

        // Update each problem with a sequential ID
        for (let i = 0; i < problems.length; i++) {
            const problem = problems[i];
            const customId = `${prefix}-${i + 1}`;

            await prisma.problem.update({
                where: { id: problem.id },
                data: { customId }
            });
        }
        console.log(`Updated ${problems.length} problems for ${subject.name}.`);
    }

    console.log('Backfill complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
