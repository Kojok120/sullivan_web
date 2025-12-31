import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Delete known English orphans
    await prisma.achievement.deleteMany({
        where: {
            slug: {
                in: ['core-unlock-all-e', 'streak-365']
            }
        }
    });
    console.log('Deleted orphaned English achievements.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
