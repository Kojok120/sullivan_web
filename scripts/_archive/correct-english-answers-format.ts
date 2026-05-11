/**
 * 英語問題の解答フォーマット是正用の一回限りスクリプト。
 *
 * 経緯:
 *   PROD スコープテスト (--limit 100) の batch-002 (E-51〜E-100) で、
 *   生成サブエージェントが穴埋め問題の解答に周辺英文と (...) 記号を含めた
 *   ため、採点 AI のコンテキストを冗長に消費する形式で書き込まれた。
 *   例: "I (clean) my room (on) (Saturday)." (NG)
 *   → "clean / on / Saturday"            (OK, 既存手入力解答と整合)
 *
 *   batch-002 を新フォーマット（穴埋めは空欄語のみ "/" 区切り）で再生成・
 *   再レビュー済みなので、reviewed.json の approvedAnswer で PROD の
 *   既存値を上書きする。
 *
 * 安全装置:
 *   - --dry-run がデフォルト
 *   - 各 item について「現在 DB に値が入っている」かつ「新しい解答と異なる」
 *     場合のみ update（現在 DB が既に正しい値や空のときは触らない）
 *   - publishedRevisionId が変わっていないかも検証
 *   - revisionId === null パス（Problem.answer のみ）専用
 *     ※ 必要なら revisionId !== null パスも追加するが、batch-002 は全て null
 *
 * 使い方:
 *   tsx scripts/correct-english-answers-format.ts --env production --in .tmp/english-answers/batch-002.reviewed.json --dry-run
 *   tsx scripts/correct-english-answers-format.ts --env production --in .tmp/english-answers/batch-002.reviewed.json --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface CliOptions {
    env: EnvName;
    dryRun: boolean;
    yes: boolean;
    inFile: string;
}

interface ReviewedItem {
    problemId: string;
    revisionId: string | null;
    customId: string;
    approvedAnswer: string;
    verdict: string;
    generatedAnswer: string;
    reviewerAnswer: string;
    note: string;
}

interface ReviewedFile {
    batchId: string;
    items: ReviewedItem[];
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        env: 'dev',
        dryRun: true,
        yes: false,
        inFile: '',
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--env') {
            const v = argv[i + 1];
            if (v !== 'dev' && v !== 'production') {
                throw new Error(`--env には dev か production を指定してください (received: ${v ?? '(none)'})`);
            }
            opts.env = v;
            i += 1;
            continue;
        }
        if (arg === '--in') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--in の値が不正です');
            opts.inFile = resolve(v);
            i += 1;
            continue;
        }
        if (arg === '--dry-run') {
            opts.dryRun = true;
            continue;
        }
        if (arg === '--yes' || arg === '-y') {
            opts.yes = true;
            opts.dryRun = false;
            continue;
        }
        if (arg?.startsWith('--')) {
            throw new Error(`未知のオプション: ${arg}`);
        }
    }
    if (!opts.inFile) {
        throw new Error('--in <path/to/batch-XXX.reviewed.json> を指定してください');
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

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    if (!existsSync(opts.inFile)) {
        throw new Error(`入力ファイルが存在しません: ${opts.inFile}`);
    }
    const parsed = JSON.parse(readFileSync(opts.inFile, 'utf-8')) as ReviewedFile;
    const approved = parsed.items.filter((i) => i.verdict === 'approved');

    console.log('--- 英語解答フォーマット是正 ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);
    console.log(`入力: ${opts.inFile}`);
    console.log(`approved アイテム: ${approved.length}`);

    const prisma = await loadPrisma();
    let willUpdate = 0;
    let alreadyCorrect = 0;
    let currentEmpty = 0;
    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ customId: string; reason: string }> = [];
    const samples: Array<{ customId: string; before: string; after: string }> = [];

    try {
        for (const item of approved) {
            if (item.revisionId !== null) {
                failed += 1;
                failures.push({
                    customId: item.customId,
                    reason: `revisionId !== null は本スクリプト対象外 (got=${item.revisionId})`,
                });
                continue;
            }
            const newAnswer = item.approvedAnswer.trim();
            if (newAnswer.length === 0) {
                failed += 1;
                failures.push({ customId: item.customId, reason: 'approvedAnswer が空' });
                continue;
            }
            const current = await prisma.problem.findUnique({
                where: { id: item.problemId },
                select: { answer: true, publishedRevisionId: true },
            });
            if (!current) {
                failed += 1;
                failures.push({ customId: item.customId, reason: 'Problem が見つかりません' });
                continue;
            }
            if (current.publishedRevisionId !== null) {
                failed += 1;
                failures.push({
                    customId: item.customId,
                    reason: `publishedRevisionId が non-null に変わっています (${current.publishedRevisionId})`,
                });
                continue;
            }
            const currentAnswer = (current.answer ?? '').trim();
            if (currentAnswer === '') {
                currentEmpty += 1;
                continue;
            }
            if (currentAnswer === newAnswer) {
                alreadyCorrect += 1;
                continue;
            }
            willUpdate += 1;
            if (samples.length < 8) {
                samples.push({ customId: item.customId, before: currentAnswer, after: newAnswer });
            }
            if (opts.dryRun) {
                continue;
            }
            try {
                await prisma.problem.update({
                    where: { id: item.problemId },
                    data: { answer: newAnswer },
                });
                succeeded += 1;
            } catch (err) {
                failed += 1;
                failures.push({ customId: item.customId, reason: (err as Error).message });
            }
            await new Promise((r) => setTimeout(r, 30));
        }
    } finally {
        await prisma.$disconnect();
    }

    console.log('');
    console.log(`[summary] 上書き対象:           ${willUpdate}`);
    console.log(`[summary] 既に正しい (skip):    ${alreadyCorrect}`);
    console.log(`[summary] 現在空 (skip):        ${currentEmpty}`);
    console.log(`[summary] 失敗:                 ${failed}`);
    if (!opts.dryRun) {
        console.log(`[summary] 成功 (update 完了):    ${succeeded}`);
    }
    if (samples.length > 0) {
        console.log('');
        console.log('[samples] before → after (先頭 8 件):');
        for (const s of samples) {
            console.log(`  ${s.customId}:`);
            console.log(`    before: ${JSON.stringify(s.before)}`);
            console.log(`    after : ${JSON.stringify(s.after)}`);
        }
    }
    if (failures.length > 0) {
        console.log('');
        console.log('[failures] 詳細 (先頭 10 件):');
        for (const f of failures.slice(0, 10)) {
            console.log(`  ${f.customId}: ${f.reason}`);
        }
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
