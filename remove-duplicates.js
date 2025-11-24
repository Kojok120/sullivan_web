const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const subjects = await prisma.subject.findMany();
    const seen = new Set();
    const duplicates = [];

    for (const subject of subjects) {
        if (seen.has(subject.name)) {
            duplicates.push(subject.id);
        } else {
            seen.add(subject.name);
        }
    }

    if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} duplicate subjects. Deleting...`);
        await prisma.subject.deleteMany({
            where: {
                id: {
                    in: duplicates,
                },
            },
        });
        console.log('Deleted duplicates.');
    } else {
        console.log('No duplicate subjects found.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
