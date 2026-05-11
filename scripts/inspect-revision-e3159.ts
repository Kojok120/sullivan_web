import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
    const argv = process.argv.slice(2);
    const envIdx = argv.indexOf('--env');
    const env = envIdx >= 0 ? argv[envIdx + 1] : 'production';
    const envFile = resolve(__dirname, '..', env === 'production' ? '.env.PRODUCTION' : '.env.DEV');
    if (!existsSync(envFile)) throw new Error(`env not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });
    const { prisma } = await import('../src/lib/prisma');
    const rec = await prisma.problem.findFirst({
        where: { customId: 'E-3159' },
        select: {
            id: true,
            customId: true,
            question: true,
            publishedRevisionId: true,
            revisions: {
                select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    structuredContent: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            },
        },
    });
    console.log('question:', JSON.stringify(rec?.question));
    console.log('publishedRevisionId:', rec?.publishedRevisionId);
    console.log('revisions count:', rec?.revisions.length ?? 0);
    for (const r of rec?.revisions ?? []) {
        console.log(`\n  rev ${r.id} status=${r.status} createdAt=${r.createdAt.toISOString()}`);
        console.log(`  structuredContent: ${JSON.stringify(r.structuredContent).slice(0, 600)}`);
    }
    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
