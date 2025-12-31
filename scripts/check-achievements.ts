import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const achievements = await prisma.achievement.findMany();
    console.log('--- Current Achievements ---');
    achievements.forEach(a => {
        console.log(`Slug: ${a.slug} | Name: ${a.name}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
