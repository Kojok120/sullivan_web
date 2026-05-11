/**
 * 英語問題の question / structuredContent 末尾に含まれる
 * 「【〇〇県】」タグの件数と分布を確認する read-only スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/inspect-prefecture-tags.ts --env production
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

async function main() {
    const argv = process.argv.slice(2);
    const envIdx = argv.indexOf('--env');
    const envValue = envIdx >= 0 ? argv[envIdx + 1] : 'dev';
    if (envValue !== 'dev' && envValue !== 'production') {
        throw new Error('--env には dev か production');
    }
    const env: EnvName = envValue;
    const envFile = envFileFor(env);
    if (!existsSync(envFile)) throw new Error(`env file not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    const prisma = await loadPrisma();
    try {
        // パターン: 全角【...県】を末尾に持つ問題を抽出
        // 「県」だけでなく「府」「都」「道」も含めるかは別途検討
        const all = await prisma.problem.findMany({
            where: {
                subject: { name: '英語' },
                status: 'PUBLISHED',
            },
            select: {
                id: true,
                customId: true,
                question: true,
                publishedRevisionId: true,
                publishedRevision: {
                    select: { id: true, structuredContent: true },
                },
            },
            orderBy: { customIdSortKey: 'asc' },
        });

        // 末尾の【〇〇県/府/都/道 (・改 含む)】に厳格化
        // 選択肢用の【 a / b / c 】を誤って削除しないよう、タグ内容が
        // 「漢字＋県/府/都/道 (任意で ・改)」だけに一致するパターンに限定
        const tailRe = /\n+\s*【[^】\/]*[県府都](?:・改)?】\s*$|\n+\s*【北海道(?:・改)?】\s*$|\n+\s*【[^】\/]*道(?:・改)?】\s*$/;
        const tailHits = all.filter((p) => tailRe.test(p.question));
        const hits = tailHits;

        console.log(`[scan] 公開英語: ${all.length}`);
        console.log(`[scan] 末尾【〇〇県/府/都/道(・改)】: ${tailHits.length}`);

        // タグの中身ごとに集計
        const tagCounts = new Map<string, number>();
        for (const p of tailHits) {
            const m = p.question.match(/【([^】]+)】\s*$/);
            const tag = m ? m[1].trim() : '?';
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
        console.log('\n--- 末尾タグ別件数 ---');
        const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
        for (const [tag, c] of sorted) {
            console.log(`  ${tag}: ${c}`);
        }
        const nonTailHits: typeof hits = [];

        // publishedRevision がある問題の structuredContent にも同じタグが入っているか
        const withRev = hits.filter((p) => p.publishedRevisionId !== null);
        console.log(`\n[scan] うち publishedRevision あり: ${withRev.length}`);

        console.log('\n--- 末尾パターン サンプル 5 件 ---');
        for (const p of tailHits.slice(0, 5)) {
            console.log(`\n[${p.customId}] (length=${p.question.length})`);
            console.log(JSON.stringify(p.question));
        }

        if (nonTailHits.length > 0) {
            console.log('\n--- 非末尾パターン (要確認) サンプル 5 件 ---');
            for (const p of nonTailHits.slice(0, 5)) {
                console.log(`\n[${p.customId}]`);
                console.log(JSON.stringify(p.question));
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('failed:', err);
    process.exitCode = 1;
});
