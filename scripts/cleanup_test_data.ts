
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const { count } = await prisma.problem.deleteMany({
        where: { customId: 'E-1' }
    });
    console.log(`Deleted ${count} test problems.`);
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
