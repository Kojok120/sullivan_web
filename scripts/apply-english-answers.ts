/**
 * batch-XXX.reviewed.json から approved アイテムを集約し、DB の
 * ProblemRevision.correctAnswer と Problem.answer に **同一トランザクションで**
 * 書き込む。flagged 系は CSV に出力し人間判断対象として残す。
 *
 * なぜ両カラムを同時に書くか:
 *   publish フロー (src/app/admin/problems/actions.ts:664-673) は
 *   ProblemRevision.correctAnswer から Problem.answer を派生する片方向同期で
 *   ある。Problem.answer のみ update しても、次回 publish で必ず上書きされる。
 *   さらに片方が空のまま update すると audit-problem-answer-sync.ts で
 *   divergence として検出される。
 *
 * 安全装置:
 *   - --dry-run がデフォルト（明示的に --yes を指定しない限り書き込まない）
 *   - 1 件ごとに独立トランザクション（CLAUDE.md の Prisma 原則: 短く保つ）
 *   - race-condition guard: 書き込み直前に両カラムが空であることを再確認
 *   - publishedRevisionId が変わっていないかも確認（reseed 等で revision が
 *     差し替わっている問題は触らない）
 *
 * 使い方:
 *   tsx scripts/apply-english-answers.ts --env dev --dry-run     # default
 *   tsx scripts/apply-english-answers.ts --env dev --yes
 *   tsx scripts/apply-english-answers.ts --env production --dry-run
 *   tsx scripts/apply-english-answers.ts --env production --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

type Verdict =
    | 'approved'
    | 'flagged_disagree'
    | 'flagged_ambiguous'
    | 'flagged_low_confidence';

interface CliOptions {
    env: EnvName;
    dryRun: boolean;
    yes: boolean;
    inDir: string;
}

interface ReviewedItem {
    problemId: string;
    revisionId: string;
    customId: string;
    approvedAnswer: string;
    verdict: Verdict;
    generatedAnswer: string;
    reviewerAnswer: string;
    note: string;
}

interface ReviewedFile {
    batchId: string;
    items: ReviewedItem[];
}

interface ManifestBatchEntry {
    batchId: string;
    fileName: string;
    count: number;
    status: 'pending' | 'generated' | 'reviewed' | 'applied';
}

interface Manifest {
    generatedAt: string;
    env: EnvName;
    totalCandidates: number;
    divergenceCount: number;
    batchSize: number;
    batches: ManifestBatchEntry[];
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
        inDir: resolve(__dirname, '..', '.tmp', 'english-answers'),
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
        if (arg === '--dry-run') {
            opts.dryRun = true;
            continue;
        }
        if (arg === '--yes' || arg === '-y') {
            opts.yes = true;
            opts.dryRun = false;
            continue;
        }
        if (arg === '--in-dir') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--in-dir の値が不正です');
            opts.inDir = resolve(v);
            i += 1;
            continue;
        }
        if (arg?.startsWith('--')) {
            throw new Error(`未知のオプション: ${arg}`);
        }
    }
    return opts;
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
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

function loadReviewedFiles(dir: string): { batchIds: string[]; items: ReviewedItem[] } {
    if (!existsSync(dir)) {
        throw new Error(`入力ディレクトリが存在しません: ${dir}`);
    }
    const files = readdirSync(dir)
        .filter((n) => /^batch-\d+\.reviewed\.json$/.test(n))
        .sort();
    if (files.length === 0) {
        throw new Error(`*.reviewed.json が見つかりません: ${dir}`);
    }
    const batchIds: string[] = [];
    const items: ReviewedItem[] = [];
    for (const name of files) {
        const raw = readFileSync(resolve(dir, name), 'utf-8');
        const parsed = JSON.parse(raw) as ReviewedFile;
        batchIds.push(parsed.batchId);
        items.push(...parsed.items);
    }
    return { batchIds, items };
}

function csvEscape(s: string): string {
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function updateManifestApplied(dir: string, batchIds: string[]) {
    const path = resolve(dir, 'manifest.json');
    if (!existsSync(path)) return;
    const raw = readFileSync(path, 'utf-8');
    const manifest = JSON.parse(raw) as Manifest;
    const set = new Set(batchIds);
    for (const b of manifest.batches) {
        if (set.has(b.batchId)) {
            b.status = 'applied';
        }
    }
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    const { batchIds, items } = loadReviewedFiles(opts.inDir);

    const approved = items.filter((i) => i.verdict === 'approved');
    const flagged = items.filter((i) => i.verdict !== 'approved');
    const countByVerdict = (v: Verdict) => items.filter((i) => i.verdict === v).length;

    console.log('--- 英語問題 解答反映 ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);
    console.log(`対象バッチ: ${batchIds.length}`);
    console.log(`総アイテム数: ${items.length}`);
    console.log(`  approved:                ${countByVerdict('approved')}`);
    console.log(`  flagged_disagree:        ${countByVerdict('flagged_disagree')}`);
    console.log(`  flagged_ambiguous:       ${countByVerdict('flagged_ambiguous')}`);
    console.log(`  flagged_low_confidence:  ${countByVerdict('flagged_low_confidence')}`);

    if (flagged.length > 0) {
        const header = 'customId,problemId,verdict,generatedAnswer,reviewerAnswer,note';
        const rows = flagged.map((i) =>
            [i.customId, i.problemId, i.verdict, i.generatedAnswer, i.reviewerAnswer, i.note]
                .map(csvEscape)
                .join(','),
        );
        const csvPath = resolve(opts.inDir, 'flagged.csv');
        writeFileSync(csvPath, `${[header, ...rows].join('\n')}\n`);
        console.log('');
        console.log(`[flagged] CSV を出力しました: ${csvPath}`);
    }

    if (opts.dryRun) {
        console.log('');
        console.log('--dry-run のため DB 書き込みは行いません');
        if (approved.length > 0) {
            console.log('');
            console.log('[approved] 先頭 5 件のサンプル:');
            for (const item of approved.slice(0, 5)) {
                console.log(`  - ${item.customId} (${item.problemId}): "${item.approvedAnswer}"`);
            }
        }
        return;
    }

    if (approved.length === 0) {
        console.log('');
        console.log('approved アイテムがありません。終了します');
        return;
    }

    const prisma = await loadPrisma();
    let succeeded = 0;
    let skippedRace = 0;
    let failed = 0;
    const failures: Array<{ customId: string; reason: string }> = [];

    try {
        for (let idx = 0; idx < approved.length; idx += 1) {
            const item = approved[idx];
            const trimmed = item.approvedAnswer.trim();
            if (trimmed.length === 0) {
                failed += 1;
                failures.push({ customId: item.customId, reason: 'approvedAnswer が空' });
                continue;
            }
            try {
                await prisma.$transaction(async (tx) => {
                    const current = await tx.problem.findUnique({
                        where: { id: item.problemId },
                        select: {
                            answer: true,
                            publishedRevisionId: true,
                            publishedRevision: { select: { correctAnswer: true } },
                        },
                    });
                    if (!current) {
                        throw new Error('Problem が見つかりません');
                    }
                    if (current.publishedRevisionId !== item.revisionId) {
                        throw new Error(
                            `publishedRevisionId が変わっています: expected=${item.revisionId} actual=${current.publishedRevisionId ?? 'null'}`,
                        );
                    }
                    const probEmpty = (current.answer ?? '').trim() === '';
                    const revEmpty = (current.publishedRevision?.correctAnswer ?? '').trim() === '';
                    if (!probEmpty || !revEmpty) {
                        throw new Error('SKIP_RACE');
                    }
                    await tx.problemRevision.update({
                        where: { id: item.revisionId },
                        data: { correctAnswer: trimmed },
                    });
                    await tx.problem.update({
                        where: { id: item.problemId },
                        data: { answer: trimmed },
                    });
                });
                succeeded += 1;
            } catch (err) {
                const msg = (err as Error).message;
                if (msg === 'SKIP_RACE') {
                    skippedRace += 1;
                } else {
                    failed += 1;
                    failures.push({ customId: item.customId, reason: msg });
                }
            }
            if ((idx + 1) % 50 === 0) {
                console.log(`  ${idx + 1}/${approved.length} 件処理...`);
            }
            await new Promise((r) => setTimeout(r, 30));
        }
    } finally {
        await prisma.$disconnect();
    }

    if (succeeded > 0) {
        updateManifestApplied(opts.inDir, batchIds);
    }

    console.log('');
    console.log(`[apply] 成功:     ${succeeded}`);
    console.log(`[apply] race-skip: ${skippedRace}`);
    console.log(`[apply] 失敗:     ${failed}`);
    if (failures.length > 0) {
        console.log('');
        console.log('[apply] 失敗詳細 (先頭 20 件):');
        for (const f of failures.slice(0, 20)) {
            console.log(`  - ${f.customId}: ${f.reason}`);
        }
    }
    if (succeeded > 0) {
        console.log('');
        console.log('完了。次のステップとして audit を推奨:');
        console.log(`  tsx scripts/audit-problem-answer-sync.ts --env ${opts.env}`);
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
