import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DB VERIFICATION START ---');
    // Log masked DB URL to confirm connection target
    const dbUrl = process.env.DATABASE_URL || 'UNDEFINED';
    const hiddenUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`Connected to: ${hiddenUrl}`);

    const problemCount = await prisma.problem.count();
    console.log(`Total Problems: ${problemCount}`);

    // Max masterNumber
    const maxMaster = await prisma.problem.findFirst({
        orderBy: { masterNumber: 'desc' },
        select: { id: true, masterNumber: true, customId: true }
    });
    console.log(`Max masterNumber: ${JSON.stringify(maxMaster)}`);

    // Problems with customId > E-1490 to see end of list
    const problems = await prisma.problem.findMany({
        where: {
            customId: {
                startsWith: 'E-',
            },
        },
        select: { customId: true },
    });

    // Manual max finding to avoid DB collation issues
    let maxNum = 0;
    let maxId = '';
    problems.forEach(p => {
        if (!p.customId) return;
        const match = p.customId.match(/^E-(\d+)$/);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) {
                maxNum = n;
                maxId = p.customId;
            }
        }
    });
    console.log(`Max CustomId Number found via JS parse: ${maxId} (${maxNum})`);

    console.log('--- DB VERIFICATION END ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
