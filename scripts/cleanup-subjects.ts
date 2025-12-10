
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for duplicate subjects...');

    const subjects = await prisma.subject.findMany({
        include: {
            coreProblems: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    const grouped = subjects.reduce((acc, subject) => {
        if (!acc[subject.name]) {
            acc[subject.name] = [];
        }
        acc[subject.name].push(subject);
        return acc;
    }, {} as Record<string, typeof subjects>);

    for (const [name, list] of Object.entries(grouped)) {
        if (list.length > 1) {
            console.log(`Found ${list.length} duplicates for ${name}`);

            // Keep the one with the most coreProblems, or the oldest one if equal
            list.sort((a, b) => b.coreProblems.length - a.coreProblems.length || a.createdAt.getTime() - b.createdAt.getTime());

            const toKeep = list[0];
            const toDelete = list.slice(1);

            console.log(`Keeping ID: ${toKeep.id} (CoreProblems: ${toKeep.coreProblems.length})`);

            for (const subject of toDelete) {
                console.log(`Processing duplicate ID: ${subject.id} (CoreProblems: ${subject.coreProblems.length})`);

                // Move coreProblems to the kept subject
                if (subject.coreProblems.length > 0) {
                    console.log(`Moving ${subject.coreProblems.length} coreProblems from ${subject.id} to ${toKeep.id}`);
                    await prisma.coreProblem.updateMany({
                        where: { subjectId: subject.id },
                        data: { subjectId: toKeep.id },
                    });
                }

                // Delete the duplicate
                console.log(`Deleting subject ID: ${subject.id}`);
                await prisma.subject.delete({
                    where: { id: subject.id },
                });
            }
        }
    }

    console.log('Cleanup finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
