/**
 * 2026-05-11 12:24 (PR #174) の `publish-null-revisions.ts` 実行により、
 * Problem.publishedRevisionId が NULL だった 4801 件について
 * `Problem.status` まで無条件で `PUBLISHED` に上書きされてしまった事故の復旧用スクリプト。
 *
 * 入力: マージ直前 (2026-05-11 12:09) の PROD バックアップから抽出した
 *   `id,status,customId,subject` の CSV (status は DRAFT または SENT_BACK のみ)。
 *
 * 動作: 1 行 1 トランザクション。現在 status='PUBLISHED' かつ CSV に
 * (id, status) が存在する Problem についてのみ、`Problem.status` をバックアップ値に戻す。
 *   - publishedRevisionId / ProblemRevision.status には触らない (ユーザー要望)。
 *   - 現状 PUBLISHED 以外なら何もしない (人手で再公開された等の race を尊重)。
 *
 * 使い方:
 *   tsx scripts/restore-problem-status-from-backup.ts --env production --csv .tmp/status-restore/backup-non-published.csv --dry-run
 *   tsx scripts/restore-problem-status-from-backup.ts --env production --csv .tmp/status-restore/backup-non-published.csv --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type EnvName = 'dev' | 'production';
type BackupStatus = 'DRAFT' | 'SENT_BACK';

interface CliOptions {
    env: EnvName;
    csvPath: string;
    dryRun: boolean;
}

interface BackupRow {
    id: string;
    status: BackupStatus;
    customId: string;
    subject: string;
}

interface DiffRow {
    id: string;
    customId: string;
    subject: string;
    fromStatus: 'PUBLISHED';
    toStatus: BackupStatus;
}

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', csvPath: '', dryRun: true };
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
        if (arg === '--csv') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--csv の値が不正です');
            opts.csvPath = resolve(v);
            i += 1;
            continue;
        }
        if (arg === '--dry-run') {
            opts.dryRun = true;
            continue;
        }
        if (arg === '--yes' || arg === '-y') {
            opts.dryRun = false;
            continue;
        }
        if (arg?.startsWith('--')) throw new Error(`未知のオプション: ${arg}`);
    }
    if (!opts.csvPath) throw new Error('--csv で CSV を指定してください');
    if (!existsSync(opts.csvPath)) throw new Error(`CSV が見つかりません: ${opts.csvPath}`);
    return opts;
}

function parseCsv(csvText: string): BackupRow[] {
    const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return [];
    const header = lines[0].split(',').map((s) => s.trim());
    const idxId = header.indexOf('id');
    const idxStatus = header.indexOf('status');
    const idxCustom = header.indexOf('customId');
    const idxSubject = header.indexOf('subject');
    if (idxId < 0 || idxStatus < 0 || idxCustom < 0 || idxSubject < 0) {
        throw new Error(`CSV ヘッダが不正です: ${header.join(',')}`);
    }
    const rows: BackupRow[] = [];
    for (let i = 1; i < lines.length; i += 1) {
        // 簡易 CSV: customId は英数 + ハイフン、subject は日本語短い名前のみのため
        // ダブルクォート/カンマエスケープは想定しない (必要なら splitCsv を実装する)。
        const cols = lines[i].split(',');
        const status = cols[idxStatus];
        if (status !== 'DRAFT' && status !== 'SENT_BACK') {
            throw new Error(`想定外の status: ${status} (line ${i + 1})`);
        }
        rows.push({
            id: cols[idxId],
            status,
            customId: cols[idxCustom],
            subject: cols[idxSubject],
        });
    }
    return rows;
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

function csvEscape(s: string): string {
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) throw new Error(`env ファイルが見つかりません: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    console.log('--- restore-problem-status-from-backup ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`CSV: ${opts.csvPath}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);

    const backup = parseCsv(readFileSync(opts.csvPath, 'utf-8'));
    console.log(`\n[csv] 復旧候補: ${backup.length}`);
    const byStatus = new Map<string, number>();
    const bySubject = new Map<string, number>();
    for (const r of backup) {
        byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
        bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + 1);
    }
    console.log(`[csv] status 内訳: ${[...byStatus].map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`[csv] subject 内訳: ${[...bySubject].map(([k, v]) => `${k}=${v}`).join(', ')}`);

    const prisma = await loadPrisma();
    try {
        const ids = backup.map((b) => b.id);
        // 現在 PUBLISHED かどうかをまとめて取得
        const current = await prisma.problem.findMany({
            where: { id: { in: ids } },
            select: { id: true, status: true, customId: true },
        });
        const currentMap = new Map(current.map((p) => [p.id, p]));

        const diffs: DiffRow[] = [];
        const skipped: Array<{ row: BackupRow; reason: string }> = [];
        for (const row of backup) {
            const cur = currentMap.get(row.id);
            if (!cur) {
                skipped.push({ row, reason: 'not_found' });
                continue;
            }
            if (cur.status !== 'PUBLISHED') {
                skipped.push({ row, reason: `current_status=${cur.status}` });
                continue;
            }
            diffs.push({
                id: row.id,
                customId: row.customId,
                subject: row.subject,
                fromStatus: 'PUBLISHED',
                toStatus: row.status,
            });
        }

        console.log(`\n[diff] 巻き戻し対象: ${diffs.length}`);
        console.log(`[diff] skip: ${skipped.length}`);
        if (skipped.length > 0) {
            const reasons = new Map<string, number>();
            for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
            for (const [k, v] of reasons) console.log(`  ${k}: ${v}`);
        }

        // diff CSV を常に出す (dry-run でも)
        const diffPath = resolve(dirname(opts.csvPath), `diff-${opts.env}.csv`);
        mkdirSync(dirname(diffPath), { recursive: true });
        const header = 'subject,customId,id,fromStatus,toStatus';
        const rows = diffs.map((d) => [d.subject, d.customId, d.id, d.fromStatus, d.toStatus].map(csvEscape).join(','));
        writeFileSync(diffPath, `\uFEFF${[header, ...rows].join('\n')}\n`);
        console.log(`\n[diff] CSV を出力: ${diffPath}`);

        if (diffs.length > 0) {
            console.log('\n[diff] 先頭 5 件:');
            for (const d of diffs.slice(0, 5)) {
                console.log(`  - ${d.subject} ${d.customId} (${d.id}) PUBLISHED -> ${d.toStatus}`);
            }
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため DB 書き込みは行いません');
            return;
        }
        if (diffs.length === 0) {
            console.log('\n巻き戻し対象 0 件のため終了します');
            return;
        }

        let succeeded = 0;
        let raceSkipped = 0;
        let failed = 0;
        const failures: Array<{ id: string; customId: string; reason: string }> = [];

        for (let idx = 0; idx < diffs.length; idx += 1) {
            const d = diffs[idx];
            try {
                await prisma.$transaction(async (tx) => {
                    // race guard: まだ PUBLISHED のままか
                    const cur = await tx.problem.findUnique({
                        where: { id: d.id },
                        select: { status: true },
                    });
                    if (!cur) throw new Error('NOT_FOUND');
                    if (cur.status !== 'PUBLISHED') throw new Error('SKIP_RACE');
                    await tx.problem.update({
                        where: { id: d.id },
                        data: { status: d.toStatus },
                    });
                });
                succeeded += 1;
            } catch (err) {
                const msg = (err as Error).message;
                if (msg === 'SKIP_RACE') raceSkipped += 1;
                else {
                    failed += 1;
                    failures.push({ id: d.id, customId: d.customId, reason: msg });
                }
            }
            if ((idx + 1) % 100 === 0) console.log(`  ${idx + 1}/${diffs.length} 件処理...`);
            await new Promise((r) => setTimeout(r, 20));
        }

        console.log('');
        console.log(`[apply] 成功:     ${succeeded}`);
        console.log(`[apply] race-skip: ${raceSkipped}`);
        console.log(`[apply] 失敗:     ${failed}`);
        if (failures.length > 0) {
            console.log('\n[apply] 失敗詳細 (先頭 10 件):');
            for (const f of failures.slice(0, 10)) {
                console.log(`  - ${f.customId} (${f.id}): ${f.reason}`);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
