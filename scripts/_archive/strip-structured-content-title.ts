/**
 * ProblemRevision.structuredContent 内の不要な `title` キーを除去するワンショットスクリプト。
 *
 * 背景: 旧スキーマでは structuredContent.title を持っていたが、現行スキーマからは削除済み。
 *       既存レコードには `title: ''` が残骸として残っているため一括で除去する。
 *
 * - structuredContent が object でない、もしくは title キーが無いレコードは触らない
 * - 冪等（再実行しても結果が同じ）
 *
 * 使い方:
 *   tsx scripts/strip-structured-content-title.ts                # 確認プロンプトあり
 *   tsx scripts/strip-structured-content-title.ts --dry-run      # 集計のみ
 *   tsx scripts/strip-structured-content-title.ts --yes          # 確認スキップ
 *
 * 接続先 DB は dotenv で .env.DEV から読み込む。
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEV_ENV_FILE = resolve(__dirname, '..', '.env.DEV');
if (existsSync(DEV_ENV_FILE)) {
    loadDotenv({ path: DEV_ENV_FILE, override: true });
}

interface CliOptions {
    dryRun: boolean;
    yes: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { dryRun: false, yes: false };
    for (const arg of argv) {
        switch (arg) {
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--yes':
            case '-y':
                opts.yes = true;
                break;
            default:
                if (arg.startsWith('--')) {
                    throw new Error(`未知のオプション: ${arg}`);
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

async function confirmInteractive(question: string): Promise<boolean> {
    const rl = createInterface({ input, output });
    try {
        const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase();
        return answer === 'y' || answer === 'yes';
    } finally {
        rl.close();
    }
}

function hasTitleKey(value: unknown): boolean {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, 'title');
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log('--- structuredContent.title 残骸クリーンアップ ---');
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const { prisma } = await import('../src/lib/prisma');
    try {
        const revisions = await prisma.problemRevision.findMany({
            select: { id: true, structuredContent: true },
        });

        const targets = revisions.filter((r) => hasTitleKey(r.structuredContent));
        console.log(`\n総 revision: ${revisions.length} 件`);
        console.log(`title キー残存: ${targets.length} 件`);

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }
        if (targets.length === 0) {
            console.log('対象なし。終了します');
            return;
        }

        if (!opts.yes) {
            const ok = await confirmInteractive('上記 revision から title キーを削除します。続行しますか？');
            if (!ok) {
                console.log('キャンセルしました');
                return;
            }
        }

        let processed = 0;
        for (const r of targets) {
            const sc = r.structuredContent as Record<string, unknown>;
            const { title: _omit, ...rest } = sc;
            void _omit;
            await prisma.problemRevision.update({
                where: { id: r.id },
                data: { structuredContent: rest as unknown as Prisma.InputJsonValue },
            });
            processed += 1;
            if (processed % 200 === 0) {
                console.log(`  ${processed}/${targets.length} 件処理...`);
            }
        }
        console.log(`\n完了: ${processed} 件から title キーを削除しました`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
