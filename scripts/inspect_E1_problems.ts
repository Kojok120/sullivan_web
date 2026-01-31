import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Inspecting E-1... problems...');
    const problems = await prisma.problem.findMany({
        where: {
            customId: {
                startsWith: 'E-1',
            },
        },
        take: 10,
        select: {
            id: true,
            customId: true,
            masterNumber: true // Check this too
        }
    });

    console.log(`Found ${problems.length} samples.`);
    problems.forEach(p => console.log(JSON.stringify(p)));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
