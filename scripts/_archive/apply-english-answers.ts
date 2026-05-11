/**
 * batch-XXX.reviewed.json から approved アイテムを集約し、DB に書き込む。
 * flagged 系は CSV に出力し人間判断対象として残す。
 *
 * 書き込み経路（item.revisionId の有無で分岐）:
 *   - revisionId === null  → Problem.answer のみ update
 *     * publishedRevision を持たない問題（PROD/DEV 英語の 99.9%）が該当。
 *       publish フローを通っていない＝Problem.answer が単独 canonical のため、
 *       Problem.answer の更新で完結する。
 *   - revisionId !== null  → ProblemRevision.correctAnswer と Problem.answer を
 *     同一トランザクションで両方 update
 *     * publish フロー (src/app/admin/problems/actions.ts:664-673) は
 *       correctAnswer から answer を派生する片方向同期。Problem.answer 単独 update
 *       では次回 publish で上書きされる。両カラム同時 update が必要。
 *
 * 安全装置:
 *   - --dry-run がデフォルト（明示的に --yes を指定しない限り書き込まない）
 *   - 1 件ごとに独立トランザクション（CLAUDE.md の Prisma 原則: 短く保つ）
 *   - race-condition guard: 書き込み直前に該当カラムが空であることを再確認
 *   - publishedRevisionId が変わっていないか確認（抽出時 null だったものに
 *     revision が付与された / その逆 などは触らない）
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
    revisionId: string | null;
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

function loadReviewedFiles(dir: string): { batchIds: string[]; items: ReviewedItem[]; questionByProblemId: Map<string, string> } {
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
    // flagged CSV に問題文を出力するため、対応する batch-XXX.json から question を引く
    const questionByProblemId = new Map<string, string>();
    const inputFiles = readdirSync(dir).filter((n) => /^batch-\d+\.json$/.test(n));
    for (const name of inputFiles) {
        const raw = readFileSync(resolve(dir, name), 'utf-8');
        const parsed = JSON.parse(raw) as { items: Array<{ problemId: string; question: string }> };
        for (const it of parsed.items) questionByProblemId.set(it.problemId, it.question);
    }
    return { batchIds, items, questionByProblemId };
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

    const { batchIds, items, questionByProblemId } = loadReviewedFiles(opts.inDir);

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
        const header = 'customId,problemId,verdict,question,generatedAnswer,reviewerAnswer,note';
        const rows = flagged.map((i) =>
            [
                i.customId,
                i.problemId,
                i.verdict,
                questionByProblemId.get(i.problemId) ?? '',
                i.generatedAnswer,
                i.reviewerAnswer,
                i.note,
            ]
                .map(csvEscape)
                .join(','),
        );
        const csvPath = resolve(opts.inDir, 'flagged.csv');
        // Excel / Numbers が UTF-8 を判定できるよう BOM を付与（日本語 note の文字化け対策）
        writeFileSync(csvPath, `\uFEFF${[header, ...rows].join('\n')}\n`);
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
                            `publishedRevisionId が変わっています: expected=${item.revisionId ?? 'null'} actual=${current.publishedRevisionId ?? 'null'}`,
                        );
                    }
                    const probEmpty = (current.answer ?? '').trim() === '';

                    if (item.revisionId === null) {
                        // 経路 A: Problem.answer のみ update
                        if (!probEmpty) {
                            throw new Error('SKIP_RACE');
                        }
                        await tx.problem.update({
                            where: { id: item.problemId },
                            data: { answer: trimmed },
                        });
                        return;
                    }

                    // 経路 B: ProblemRevision.correctAnswer と Problem.answer を同時 update
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
