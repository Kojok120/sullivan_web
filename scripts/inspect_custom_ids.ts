
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const problems = await prisma.problem.findMany({
        where: {
            customId: { startsWith: 'E-' }
        },
        select: { customId: true }
    });

    console.log('Existing Custom IDs:', problems.map(p => p.customId).sort());
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
