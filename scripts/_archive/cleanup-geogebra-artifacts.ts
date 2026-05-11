/**
 * GeoGebra 連携廃止に伴う残骸データを物理削除するスクリプト。
 *
 * 対象:
 *   1. ProblemRevision.authoringTool = 'GEOGEBRA' な revision を 'MANUAL' に書き戻し、
 *      authoringState を null に落とす（GeoGebra 由来の applet state は描画も編集もできないため）
 *   2. ProblemAsset.kind = 'GEOGEBRA_STATE' のアセットを削除
 *
 * 1 revision ぶんの (1) と (1 に紐づく 2) は同一トランザクションで実行する。
 * 違う revision に属する処理は別トランザクション。
 *
 * 既に MANUAL に直っていて GEOGEBRA_STATE アセットも無い revision は対象外（冪等）。
 *
 * 使い方:
 *   tsx scripts/cleanup-geogebra-artifacts.ts                          # .env.DEV 対話確認あり
 *   tsx scripts/cleanup-geogebra-artifacts.ts --dry-run                # 集計のみ
 *   tsx scripts/cleanup-geogebra-artifacts.ts --yes                    # 確認スキップ
 *   tsx scripts/cleanup-geogebra-artifacts.ts --env production --yes   # 本番反映
 *
 * 本番実行前に必ず ./scripts/backup-production-db.sh で dump を取ること。
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
    dryRun: boolean;
    yes: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', dryRun: false, yes: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--yes':
            case '-y':
                opts.yes = true;
                break;
            case '--env': {
                const value = argv[i + 1];
                if (value !== 'dev' && value !== 'production') {
                    throw new Error(`--env には dev か production を指定してください (received: ${value ?? '(none)'})`);
                }
                opts.env = value;
                i += 1;
                break;
            }
            default:
                if (arg?.startsWith('--')) {
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

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    const databaseUrl = process.env.DATABASE_URL;
    console.log('--- GeoGebra 残骸クリーンアップ ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(databaseUrl)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const prisma = await loadPrisma();
    try {
        // GEOGEBRA な revision または GEOGEBRA_STATE asset を持つ revision を一気に取る。
        // この OR 集合で取れば「authoringTool は MANUAL に戻ったが asset だけ残った」
        // 中途半端な状態の revision も拾える。
        const revisions = await prisma.problemRevision.findMany({
            where: {
                OR: [
                    { authoringTool: 'GEOGEBRA' },
                    { assets: { some: { kind: 'GEOGEBRA_STATE' } } },
                ],
            },
            select: {
                id: true,
                revisionNumber: true,
                status: true,
                authoringTool: true,
                authoringState: true,
                problem: { select: { customId: true, subject: { select: { name: true } } } },
                assets: {
                    where: { kind: 'GEOGEBRA_STATE' },
                    select: { id: true, fileName: true },
                },
            },
        });

        console.log(`\n対象 revision: ${revisions.length} 件`);

        // プラン作成
        const plan = revisions.map((rev) => {
            const needRevisionUpdate = rev.authoringTool === 'GEOGEBRA' || rev.authoringState !== null;
            const assetIdsToDelete = rev.assets.map((a) => a.id);
            return {
                rev,
                needRevisionUpdate,
                assetIdsToDelete,
            };
        }).filter((row) => row.needRevisionUpdate || row.assetIdsToDelete.length > 0);

        console.log(`処理対象 (実差分あり): ${plan.length} 件`);
        for (const row of plan) {
            const { rev, needRevisionUpdate, assetIdsToDelete } = row;
            const flags = [
                needRevisionUpdate ? `tool=${rev.authoringTool}` : null,
                assetIdsToDelete.length > 0 ? `assets=${assetIdsToDelete.length}` : null,
            ].filter(Boolean).join(' ');
            console.log(`  ${rev.problem.subject.name}/${rev.problem.customId} rev=${rev.revisionNumber} (${rev.status}): ${flags}`);
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }
        if (plan.length === 0) {
            console.log('処理対象なし。終了します');
            return;
        }

        if (!opts.yes) {
            const ok = await confirmInteractive('上記を反映します。続行しますか？');
            if (!ok) {
                console.log('キャンセルしました');
                return;
            }
        }

        let processed = 0;
        for (const row of plan) {
            const { rev, needRevisionUpdate, assetIdsToDelete } = row;
            await prisma.$transaction(async (tx) => {
                if (assetIdsToDelete.length > 0) {
                    await tx.problemAsset.deleteMany({
                        where: { id: { in: assetIdsToDelete } },
                    });
                }
                if (needRevisionUpdate) {
                    await tx.problemRevision.update({
                        where: { id: rev.id },
                        data: {
                            authoringTool: 'MANUAL',
                            // Prisma で nullable Json を明示的に JSON null にするには
                            // Prisma.JsonNull を渡す必要がある。素の null だと型エラー。
                            authoringState: Prisma.JsonNull,
                        },
                    });
                }
            });
            processed += 1;
            if (processed % 25 === 0) {
                console.log(`  ${processed}/${plan.length} 件処理...`);
            }
        }

        console.log(`\n完了: ${processed} 件を処理しました`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
