/**
 * 単一の Problem を customId 指定で読み取り、
 * 本文・解答・publishedRevision / 全 revision の structuredContent と answerSpec を JSON で表示する read-only スクリプト。
 *
 * triage 編集の前後で「現状はどうなっているか」を確認するために使う。
 *
 * 使い方:
 *   tsx scripts/inspect-single-problem.ts --env production --custom-id M-1068
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

interface CliOptions {
    env: EnvName;
    customId: string | null;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', customId: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--env') {
            const v = argv[i + 1];
            if (v !== 'dev' && v !== 'production') throw new Error(`--env: ${v}`);
            opts.env = v;
            i += 1;
            continue;
        }
        if (arg === '--custom-id') {
            opts.customId = argv[i + 1] ?? null;
            i += 1;
            continue;
        }
        if (arg?.startsWith('--')) throw new Error(`未知のオプション: ${arg}`);
    }
    if (!opts.customId) throw new Error('--custom-id を指定してください');
    return opts;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) throw new Error(`env ファイルが見つかりません: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    const prisma = await loadPrisma();
    try {
        const problem = await prisma.problem.findFirst({
            where: { customId: opts.customId! },
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                acceptedAnswers: true,
                publishedRevisionId: true,
                subject: { select: { name: true } },
                problemType: true,
            },
        });
        if (!problem) {
            console.log(`見つかりません: ${opts.customId}`);
            return;
        }

        const revisions = await prisma.problemRevision.findMany({
            where: { problemId: problem.id },
            orderBy: { revisionNumber: 'asc' },
            select: {
                id: true,
                revisionNumber: true,
                status: true,
                authoringTool: true,
                structuredContent: true,
                answerSpec: true,
                printConfig: true,
            },
        });

        const out = {
            problem,
            isPublished: !!problem.publishedRevisionId,
            revisions,
        };
        console.log(JSON.stringify(out, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
