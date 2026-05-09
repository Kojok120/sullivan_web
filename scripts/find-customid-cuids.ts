/**
 * customId 配列から cuid を引く読み取り専用スクリプト。
 *
 *   tsx scripts/find-customid-cuids.ts --env production M-1907 M-1908 M-696 M-706
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';
const ALLOWED_ENVS: readonly EnvName[] = ['dev', 'production'];

function parseEnv(raw: string | undefined): EnvName {
    if (!raw || !ALLOWED_ENVS.includes(raw as EnvName)) {
        throw new Error(
            `--env の値が不正です: "${raw ?? ''}" (許可: ${ALLOWED_ENVS.join(' | ')})`,
        );
    }
    return raw as EnvName;
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

async function main() {
    const args = process.argv.slice(2);
    let env: EnvName = 'dev';
    const customIds: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--env') {
            env = parseEnv(args[++i]);
        } else if (a.startsWith('--env=')) {
            env = parseEnv(a.split('=')[1]);
        } else {
            customIds.push(a);
        }
    }
    if (customIds.length === 0) {
        console.error('usage: tsx scripts/find-customid-cuids.ts --env production M-XXXX [M-YYYY ...]');
        process.exit(1);
    }

    loadDotenv({ path: envFileFor(env), override: true });

    const { prisma } = await import('../src/lib/prisma');
    const rows = await prisma.problem.findMany({
        where: { customId: { in: customIds } },
        select: { id: true, customId: true, status: true, subject: { select: { name: true } } },
    });

    const byCustom: Record<string, (typeof rows)[number]> = {};
    for (const r of rows) byCustom[r.customId] = r;

    for (const cid of customIds) {
        const row = byCustom[cid];
        if (!row) {
            console.log(`${cid}\t<not found>`);
        } else {
            console.log(`${cid}\t${row.id}\t${row.status}\t${row.subject?.name ?? ''}`);
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
