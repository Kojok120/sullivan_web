/**
 * 単一の Problem を customId 指定で読み取り、
 * 本文・解答・publishedRevision / 全 revision の structuredContent と answerSpec を JSON で表示する read-only スクリプト。
 *
 * triage 編集の前後で「現状はどうなっているか」を確認するために使う。
 *
 * 使い方:
 *   tsx scripts/inspect-single-problem.ts --env production --custom-id M-1068
 */

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
            if (!v || v.startsWith('--')) throw new Error('--env の値が不正です');
            if (v !== 'dev' && v !== 'production') throw new Error(`--env: ${v}`);
            opts.env = v;
            i += 1;
            continue;
        }
        if (arg === '--custom-id') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--custom-id の値が不正です');
            opts.customId = v;
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
        // customId は (subjectId, customId) で複合 unique なので、複数 subject に同名が
        // 存在しうる。重複している場合は黙って先頭1件を返さず明示的にエラーで止める。
        const problems = await prisma.problem.findMany({
            where: { customId: opts.customId! },
            take: 2,
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
        if (problems.length === 0) {
            console.log(`見つかりません: ${opts.customId}`);
            return;
        }
        if (problems.length > 1) {
            throw new Error(`customId が複数の Problem に一致します: ${opts.customId}（subject 等で一意化が必要）`);
        }
        const problem = problems[0];

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
