
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const subjects = await prisma.subject.findMany();
    console.log('Subjects:', subjects.map(s => s.name));

    const problems = await prisma.problem.findMany({
        select: { customId: true },
        take: 20
    });
    console.log('Sample Custom IDs:', problems.map(p => p.customId));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
