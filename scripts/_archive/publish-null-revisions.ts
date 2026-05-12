/**
 * publishedRevisionId が NULL の Problem について、
 * 最新 DRAFT revision を PUBLISHED に昇格し Problem.publishedRevisionId を張り替える。
 *
 * 経緯:
 *   旧エディタ由来の問題 (PROD で英語 3392 / 数学 1409 など計 4801 件) は
 *   ProblemRevision を持つにも関わらず publish 経路を通っておらず、
 *   `Problem.answer` が単独 canonical な状態で残っている。
 *   この状態だと AI 採点や生徒画面の参照を `publishedRevision.correctAnswer` に
 *   一本化できないため、legacy フィールド撤廃の事前マイグレーションとして
 *   一斉に publish 状態を整える。
 *
 * 動作 (1 問 1 トランザクション):
 *   1. 最新 DRAFT revision を取得 (revisionNumber desc)。無ければ skip (no_draft)
 *   2. 正解情報のコピー判定:
 *      - revision.correctAnswer が空 / null かつ Problem.answer に値あり → revision にコピー
 *      - revision.acceptedAnswers が空配列かつ Problem.acceptedAnswers に値あり → コピー
 *      - 両側に値があり、かつ不一致 → skip (flagged_answer_mismatch)
 *   3. 既存の PUBLISHED revision (本来 0 件のはず) を SUPERSEDED に
 *   4. DRAFT revision を PUBLISHED + publishedAt = now()
 *   5. Problem.publishedRevisionId を張り替え、status を PUBLISHED に確定
 *      - Problem.question / answer / acceptedAnswers / hasStructuredContent は触らない
 *        (Phase B 完了後の Phase C で drop されるカラム)
 *
 * 安全装置:
 *   - --dry-run がデフォルト (明示的に --yes でない限り書き込まない)
 *   - 1 件ごとに独立トランザクション (CLAUDE.md の Prisma 原則: 短く保つ)
 *   - race-condition guard: 書き込み直前に Problem.publishedRevisionId === null を再確認
 *   - 各 update 後に 20ms sleep (Supabase pool 圧迫防止)
 *
 * 使い方:
 *   tsx scripts/publish-null-revisions.ts --env dev --dry-run            # default
 *   tsx scripts/publish-null-revisions.ts --env dev --yes
 *   tsx scripts/publish-null-revisions.ts --env production --dry-run
 *   tsx scripts/publish-null-revisions.ts --env production --limit 100 --yes
 *   tsx scripts/publish-null-revisions.ts --env production --yes
 *
 * 検証:
 *   tsx scripts/audit-problem-answer-sync.ts --env <env>
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

interface CliOptions {
    env: EnvName;
    dryRun: boolean;
    limit: number | null;
    outDir: string;
}

interface FlaggedRow {
    problemId: string;
    customId: string;
    subject: string;
    reason:
        | 'no_draft'
        | 'flagged_answer_mismatch'
        | 'flagged_accepted_mismatch'
        | 'race_skip'
        | 'failed';
    detail: string;
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
        limit: null,
        outDir: resolve(__dirname, '..', '.tmp', 'publish-null'),
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
            opts.dryRun = false;
            continue;
        }
        if (arg === '--limit') {
            const v = argv[i + 1];
            const parsed = Number.parseInt(v ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('--limit は正の整数');
            opts.limit = parsed;
            i += 1;
            continue;
        }
        if (arg === '--out-dir') {
            const v = argv[i + 1];
            if (!v || v.startsWith('--')) throw new Error('--out-dir の値が不正です');
            opts.outDir = resolve(v);
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

function csvEscape(s: string): string {
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function normalizeAccepted(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(
        new Set(
            values
                .filter((v): v is string => typeof v === 'string')
                .map((v) => v.trim())
                .filter((v) => v.length > 0),
        ),
    ).sort();
}

function setEquals(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

interface Target {
    problemId: string;
    customId: string;
    subject: string;
    problemAnswer: string | null;
    problemAccepted: string[];
    draftRevisionId: string;
    revCorrectAnswer: string | null;
    revAccepted: string[];
    hasOtherPublishedRevisions: boolean;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    console.log('--- publish-null-revisions ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`mode: ${opts.dryRun ? 'dry-run' : 'apply'}`);
    if (opts.limit !== null) console.log(`limit: ${opts.limit}`);

    if (!existsSync(opts.outDir)) mkdirSync(opts.outDir, { recursive: true });

    const prisma = await loadPrisma();
    try {
        const candidates = await prisma.problem.findMany({
            where: { publishedRevisionId: null },
            select: {
                id: true,
                customId: true,
                answer: true,
                acceptedAnswers: true,
                subject: { select: { name: true } },
                revisions: {
                    where: { status: 'DRAFT' },
                    orderBy: { revisionNumber: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        correctAnswer: true,
                        acceptedAnswers: true,
                    },
                },
                _count: {
                    select: {
                        revisions: { where: { status: 'PUBLISHED' } },
                    },
                },
            },
            orderBy: [{ subjectId: 'asc' }, { customIdSortKey: 'asc' }],
            ...(opts.limit !== null ? { take: opts.limit } : {}),
        });

        console.log(`\n[scan] publishedRevisionId IS NULL: ${candidates.length}`);

        const targets: Target[] = [];
        const flagged: FlaggedRow[] = [];

        for (const c of candidates) {
            const draft = c.revisions[0];
            if (!draft) {
                flagged.push({
                    problemId: c.id,
                    customId: c.customId,
                    subject: c.subject.name,
                    reason: 'no_draft',
                    detail: 'DRAFT revision が無いため publish 不可',
                });
                continue;
            }
            const problemAnswer = (c.answer ?? '').trim();
            const revAnswer = (draft.correctAnswer ?? '').trim();
            if (problemAnswer.length > 0 && revAnswer.length > 0 && problemAnswer !== revAnswer) {
                flagged.push({
                    problemId: c.id,
                    customId: c.customId,
                    subject: c.subject.name,
                    reason: 'flagged_answer_mismatch',
                    detail: `Problem.answer="${problemAnswer}" vs revision.correctAnswer="${revAnswer}"`,
                });
                continue;
            }
            const problemAccepted = normalizeAccepted(c.acceptedAnswers);
            const revAccepted = normalizeAccepted(draft.acceptedAnswers);
            if (problemAccepted.length > 0 && revAccepted.length > 0 && !setEquals(problemAccepted, revAccepted)) {
                flagged.push({
                    problemId: c.id,
                    customId: c.customId,
                    subject: c.subject.name,
                    reason: 'flagged_accepted_mismatch',
                    detail: `Problem=${JSON.stringify(problemAccepted)} vs revision=${JSON.stringify(revAccepted)}`,
                });
                continue;
            }

            targets.push({
                problemId: c.id,
                customId: c.customId,
                subject: c.subject.name,
                problemAnswer: c.answer,
                problemAccepted,
                draftRevisionId: draft.id,
                revCorrectAnswer: draft.correctAnswer,
                revAccepted,
                hasOtherPublishedRevisions: c._count.revisions > 0,
            });
        }

        // 教科別内訳
        const bySubject = new Map<string, { total: number; targets: number; flagged: number }>();
        for (const c of candidates) {
            const cur = bySubject.get(c.subject.name) ?? { total: 0, targets: 0, flagged: 0 };
            cur.total += 1;
            bySubject.set(c.subject.name, cur);
        }
        for (const t of targets) {
            const cur = bySubject.get(t.subject)!;
            cur.targets += 1;
        }
        for (const f of flagged) {
            const cur = bySubject.get(f.subject)!;
            cur.flagged += 1;
        }
        console.log('[scan] 教科別 (total / 昇格対象 / flagged):');
        for (const [name, v] of bySubject) {
            console.log(`  ${name}: total=${v.total} targets=${v.targets} flagged=${v.flagged}`);
        }
        console.log(`\n[scan] 昇格対象: ${targets.length}`);
        console.log(`[scan] flagged:   ${flagged.length}`);

        // flagged 内訳
        const byReason = new Map<string, number>();
        for (const f of flagged) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
        for (const [k, v] of byReason) console.log(`  ${k}: ${v}`);

        const copyAnswerCount = targets.filter(
            (t) => (t.revCorrectAnswer ?? '').trim() === '' && (t.problemAnswer ?? '').trim() !== '',
        ).length;
        const copyAcceptedCount = targets.filter(
            (t) => t.revAccepted.length === 0 && t.problemAccepted.length > 0,
        ).length;
        const reSupersedeCount = targets.filter((t) => t.hasOtherPublishedRevisions).length;
        console.log('');
        console.log(`[plan] revision.correctAnswer に Problem.answer をコピーする件数: ${copyAnswerCount}`);
        console.log(`[plan] revision.acceptedAnswers に Problem.acceptedAnswers をコピーする件数: ${copyAcceptedCount}`);
        console.log(`[plan] 既存 PUBLISHED revision を SUPERSEDED にする件数: ${reSupersedeCount}`);

        // flagged CSV を常に書く (dry-run でも書く)
        if (flagged.length > 0) {
            const header = 'subject,customId,problemId,reason,detail';
            const rows = flagged.map((f) => [f.subject, f.customId, f.problemId, f.reason, f.detail].map(csvEscape).join(','));
            const csvPath = resolve(opts.outDir, 'flagged.csv');
            writeFileSync(csvPath, `\uFEFF${[header, ...rows].join('\n')}\n`);
            console.log(`\n[flagged] CSV を出力しました: ${csvPath}`);
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため DB 書き込みは行いません');
            if (targets.length > 0) {
                console.log('\n[targets] 先頭 5 件サンプル:');
                for (const t of targets.slice(0, 5)) {
                    console.log(
                        `  - ${t.subject} ${t.customId} (${t.problemId}) draft=${t.draftRevisionId} ` +
                            `probAns="${(t.problemAnswer ?? '').slice(0, 40)}" revAns="${(t.revCorrectAnswer ?? '').slice(0, 40)}"`,
                    );
                }
            }
            return;
        }

        if (targets.length === 0) {
            console.log('\n昇格対象 0 件のため終了します');
            return;
        }

        let succeeded = 0;
        let skippedRace = 0;
        let failed = 0;
        const writeFailures: FlaggedRow[] = [];

        for (let idx = 0; idx < targets.length; idx += 1) {
            const t = targets[idx];
            try {
                await prisma.$transaction(async (tx) => {
                    // race guard: publishedRevisionId が null のままであることを再確認
                    const current = await tx.problem.findUnique({
                        where: { id: t.problemId },
                        select: { publishedRevisionId: true, status: true },
                    });
                    if (!current) throw new Error('Problem が見つかりません');
                    if (current.publishedRevisionId !== null) {
                        throw new Error('SKIP_RACE');
                    }

                    // race guard: DRAFT revision がまだ DRAFT のままであることを再確認
                    const draftCurrent = await tx.problemRevision.findUnique({
                        where: { id: t.draftRevisionId },
                        select: { status: true, correctAnswer: true, acceptedAnswers: true },
                    });
                    if (!draftCurrent) throw new Error('DRAFT revision が見つかりません');
                    if (draftCurrent.status !== 'DRAFT') throw new Error('SKIP_RACE');

                    // 正解情報を revision にコピー (空のときだけ)
                    const revAnsNow = (draftCurrent.correctAnswer ?? '').trim();
                    const probAns = (t.problemAnswer ?? '').trim();
                    const needCopyAnswer = revAnsNow.length === 0 && probAns.length > 0;
                    const revAcceptedNow = normalizeAccepted(draftCurrent.acceptedAnswers);
                    const needCopyAccepted =
                        revAcceptedNow.length === 0 && t.problemAccepted.length > 0;

                    if (needCopyAnswer || needCopyAccepted) {
                        await tx.problemRevision.update({
                            where: { id: t.draftRevisionId },
                            data: {
                                ...(needCopyAnswer ? { correctAnswer: probAns } : {}),
                                ...(needCopyAccepted ? { acceptedAnswers: t.problemAccepted } : {}),
                            },
                        });
                    }

                    // 既存 PUBLISHED revision を SUPERSEDED に
                    if (t.hasOtherPublishedRevisions) {
                        await tx.problemRevision.updateMany({
                            where: {
                                problemId: t.problemId,
                                id: { not: t.draftRevisionId },
                                status: 'PUBLISHED',
                            },
                            data: { status: 'SUPERSEDED' },
                        });
                    }

                    // DRAFT → PUBLISHED に昇格
                    await tx.problemRevision.update({
                        where: { id: t.draftRevisionId },
                        data: {
                            status: 'PUBLISHED',
                            publishedAt: new Date(),
                        },
                    });

                    // Problem に張り替え
                    await tx.problem.update({
                        where: { id: t.problemId },
                        data: {
                            publishedRevisionId: t.draftRevisionId,
                            status: 'PUBLISHED',
                        },
                    });
                });
                succeeded += 1;
            } catch (err) {
                const msg = (err as Error).message;
                if (msg === 'SKIP_RACE') {
                    skippedRace += 1;
                } else {
                    failed += 1;
                    writeFailures.push({
                        problemId: t.problemId,
                        customId: t.customId,
                        subject: t.subject,
                        reason: 'failed',
                        detail: msg,
                    });
                }
            }

            if ((idx + 1) % 50 === 0) {
                console.log(`  ${idx + 1}/${targets.length} 件処理...`);
            }
            await new Promise((r) => setTimeout(r, 20));
        }

        console.log('');
        console.log(`[apply] 成功:     ${succeeded}`);
        console.log(`[apply] race-skip: ${skippedRace}`);
        console.log(`[apply] 失敗:     ${failed}`);

        if (writeFailures.length > 0) {
            console.log('\n[apply] 失敗詳細 (先頭 20 件):');
            for (const f of writeFailures.slice(0, 20)) {
                console.log(`  - ${f.subject} ${f.customId}: ${f.detail}`);
            }
            const header = 'subject,customId,problemId,reason,detail';
            const rows = writeFailures.map((f) => [f.subject, f.customId, f.problemId, f.reason, f.detail].map(csvEscape).join(','));
            const failPath = resolve(opts.outDir, 'failures.csv');
            writeFileSync(failPath, `\uFEFF${[header, ...rows].join('\n')}\n`);
            console.log(`\n[apply] 失敗 CSV を出力しました: ${failPath}`);
        }

        if (succeeded > 0) {
            console.log('\n完了。次のステップとして audit を推奨:');
            console.log(`  tsx scripts/audit-problem-answer-sync.ts --env ${opts.env}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
