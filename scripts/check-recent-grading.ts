/**
 * 直近の採点履歴 (LearningHistory) を確認するワンショット診断スクリプト。
 *
 * 使い方:
 *   tsx scripts/check-recent-grading.ts                   # 直近 60 分
 *   tsx scripts/check-recent-grading.ts --minutes 180     # 直近 180 分
 *
 * 接続先 DB は dotenv で .env.DEV から読み込む。
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEV_ENV_FILE = resolve(__dirname, '..', '.env.DEV');
if (existsSync(DEV_ENV_FILE)) {
    loadDotenv({ path: DEV_ENV_FILE, override: true });
}

interface CliOptions {
    minutes: number;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { minutes: 60 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--minutes' || arg === '-m') {
            const value = Number(argv[i + 1]);
            if (Number.isFinite(value) && value > 0) {
                opts.minutes = value;
                i += 1;
            }
        }
    }
    return opts;
}

function describeDatabaseUrl(databaseUrl: string | undefined) {
    if (!databaseUrl) return '(未設定)';
    try {
        const url = new URL(databaseUrl);
        const dbName = url.pathname.replace(/^\//, '') || '(no-db)';
        return `${url.protocol}//${url.username || '(no-user)'}@${url.host}/${dbName}`;
    } catch {
        return '(parse-error)';
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log('--- 直近の採点履歴 (LearningHistory) ---');
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`対象期間: 直近 ${opts.minutes} 分`);

    const since = new Date(Date.now() - opts.minutes * 60 * 1000);
    const { prisma } = await import('../src/lib/prisma');
    try {
        const histories = await prisma.learningHistory.findMany({
            where: { answeredAt: { gte: since } },
            orderBy: { answeredAt: 'desc' },
            take: 50,
            select: {
                id: true,
                answeredAt: true,
                evaluation: true,
                userAnswer: true,
                feedback: true,
                groupId: true,
                user: { select: { loginId: true, name: true } },
                problem: {
                    select: {
                        customId: true,
                        subject: { select: { name: true } },
                    },
                },
            },
        });

        console.log(`\n件数: ${histories.length}`);
        for (const h of histories) {
            const answer = (h.userAnswer ?? '').replace(/\s+/g, ' ').slice(0, 40);
            const feedback = (h.feedback ?? '').replace(/\s+/g, ' ').slice(0, 60);
            console.log(
                `  ${h.answeredAt.toISOString()} ${h.evaluation} ${h.problem?.subject?.name ?? '?'}/${h.problem?.customId ?? '?'} ` +
                `user=${h.user?.loginId ?? '?'}(${h.user?.name ?? '?'}) group=${h.groupId ?? '-'}\n` +
                `      answer="${answer}" feedback="${feedback}"`,
            );
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
