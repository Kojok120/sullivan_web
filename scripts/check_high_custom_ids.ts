import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching all E- problems to find max ID ...');
    const problems = await prisma.problem.findMany({
        where: {
            customId: {
                startsWith: 'E-',
            },
        },
        select: {
            id: true,
            customId: true,
        }
    });

    const parsed = problems.map(p => {
        if (!p.customId) return null;
        const match = p.customId.match(/^E-(\d+)$/);
        if (match) {
            return { original: p, num: parseInt(match[1], 10) };
        }
        return null;
    }).filter(Boolean);

    // Sort desc
    parsed.sort((a, b) => (b?.num || 0) - (a?.num || 0));

    console.log('Top 20 highest IDs:');
    parsed.slice(0, 20).forEach(p => console.log(`${p?.original.customId} (Num: ${p?.num})`));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
