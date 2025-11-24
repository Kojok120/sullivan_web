
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for duplicate units...');

    const units = await prisma.unit.findMany({
        include: {
            coreProblems: true,
            subject: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    // Group by subjectId and name
    const grouped = units.reduce((acc, unit) => {
        const key = `${unit.subjectId}-${unit.name}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(unit);
        return acc;
    }, {} as Record<string, typeof units>);

    for (const [key, list] of Object.entries(grouped)) {
        if (list.length > 1) {
            const [subjectId, name] = key.split('-');
            console.log(`Found ${list.length} duplicates for Unit "${name}" (Subject ID: ${subjectId})`);

            // Keep the one with the most coreProblems, or the oldest one if equal
            list.sort((a, b) => b.coreProblems.length - a.coreProblems.length || a.createdAt.getTime() - b.createdAt.getTime());

            const toKeep = list[0];
            const toDelete = list.slice(1);

            console.log(`Keeping Unit ID: ${toKeep.id} (CoreProblems: ${toKeep.coreProblems.length})`);

            for (const unit of toDelete) {
                console.log(`Processing duplicate Unit ID: ${unit.id} (CoreProblems: ${unit.coreProblems.length})`);

                // Move coreProblems to the kept unit
                if (unit.coreProblems.length > 0) {
                    console.log(`Moving ${unit.coreProblems.length} coreProblems from ${unit.id} to ${toKeep.id}`);
                    await prisma.coreProblem.updateMany({
                        where: { unitId: unit.id },
                        data: { unitId: toKeep.id },
                    });
                }

                // Delete the duplicate unit
                console.log(`Deleting Unit ID: ${unit.id}`);
                await prisma.unit.delete({
                    where: { id: unit.id },
                });
            }
        }
    }

    console.log('Unit cleanup finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
