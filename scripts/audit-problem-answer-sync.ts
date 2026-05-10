/**
 * 段階B' の安全網: 構造化された公開済問題で
 * `Problem.answer` / `Problem.acceptedAnswers` と
 * `publishedRevision.correctAnswer` / `acceptedAnswers` (専用カラム) が
 * 同期された状態を保てているかを監査する read-only スクリプト。
 *
 * 採点側は段階A 以降 Problem 側だけを正解の信頼源として参照する。
 * publish フローは ProblemRevision の正解専用カラムから Problem.answer / acceptedAnswers を
 * 派生する片方向同期で運用しているため、同期が崩れると AI 採点に間違った正解が渡る恐れがある。
 *
 * 監査対象の判定軸:
 * - 「構造化問題か」は `publishedRevision.structuredContent` の有無で決める。
 *   段階C で `Problem.contentFormat` カラムは撤去済み。
 *
 * 使い方:
 *   tsx scripts/audit-problem-answer-sync.ts --env production
 *   tsx scripts/audit-problem-answer-sync.ts --env dev
 *
 * 不整合が 1 件でもあれば exit 1 を返す。
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

interface CliOptions {
    env: EnvName;
    limit: number;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { env: 'dev', limit: 20 };
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
        if (arg === '--limit') {
            const v = argv[i + 1];
            const parsed = Number.parseInt(v ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('--limit は正の整数');
            opts.limit = parsed;
            i += 1;
            continue;
        }
        if (arg?.startsWith('--')) throw new Error(`未知のオプション: ${arg}`);
    }
    return opts;
}

async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

function normalizeAcceptedAnswers(values: unknown): string[] {
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

interface Divergence {
    problemId: string;
    customId: string;
    subject: string;
    kind: 'correctAnswer' | 'acceptedAnswers';
    detail: string;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) throw new Error(`env ファイルが見つかりません: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    const prisma = await loadPrisma();
    try {
        // 公開リビジョンを持つ全問題を取得し、JS 側で structuredContent の有無で監査対象を絞る。
        // (本番採点ロジックと同じ判定軸にすることで、`PLAIN_TEXT` のまま structuredContent を持つ
        // 行が監査から漏れて偽陽性 (divergence=0) を返す事故を防ぐ)
        const problems = await prisma.problem.findMany({
            where: {
                publishedRevisionId: { not: null },
            },
            select: {
                id: true,
                customId: true,
                answer: true,
                acceptedAnswers: true,
                subject: { select: { name: true } },
                publishedRevision: {
                    select: {
                        correctAnswer: true,
                        acceptedAnswers: true,
                        structuredContent: true,
                    },
                },
            },
        });

        const divergences: Divergence[] = [];
        let auditedCount = 0;

        for (const p of problems) {
            // 構造化されていない公開済問題 (legacy English 等) は本監査の対象外。
            // それらは Problem.answer が canonical で、検証する revision の正解カラムが存在しない。
            const hasStructuredContent = p.publishedRevision?.structuredContent != null;
            if (!hasStructuredContent) {
                continue;
            }

            auditedCount += 1;

            // null と空文字は「未設定」として等価扱い。両者が一致していれば divergence ではない。
            // 段階B' の backfill で answerSpec.correctAnswer = '' は revision.correctAnswer = NULL に
            // マップされるため、Problem.answer が null/空 のときは正常に同期している。
            const specCorrect = (p.publishedRevision?.correctAnswer ?? '').trim();
            const problemAnswer = (p.answer ?? '').trim();
            if (specCorrect !== problemAnswer) {
                divergences.push({
                    problemId: p.id,
                    customId: p.customId,
                    subject: p.subject.name,
                    kind: 'correctAnswer',
                    detail: `Problem.answer="${problemAnswer}" vs revision.correctAnswer="${specCorrect}"`,
                });
            }

            const revisionAccepted = normalizeAcceptedAnswers(
                p.publishedRevision?.acceptedAnswers,
            );
            const problemAccepted = normalizeAcceptedAnswers(p.acceptedAnswers);
            if (!setEquals(revisionAccepted, problemAccepted)) {
                divergences.push({
                    problemId: p.id,
                    customId: p.customId,
                    subject: p.subject.name,
                    kind: 'acceptedAnswers',
                    detail: `Problem=${JSON.stringify(problemAccepted)} vs revision=${JSON.stringify(revisionAccepted)}`,
                });
            }
        }

        const total = problems.length;
        const failed = divergences.length;

        console.log(`[audit] env=${opts.env}`);
        console.log(`[audit] 公開済 (publishedRevisionId あり) 件数: ${total}`);
        console.log(`[audit] うち構造化問題 (監査対象) 件数: ${auditedCount}`);
        console.log(`[audit] 不整合件数: ${failed}`);

        if (failed > 0) {
            console.log(`[audit] 不整合サンプル（先頭 ${Math.min(failed, opts.limit)} 件）:`);
            for (const d of divergences.slice(0, opts.limit)) {
                console.log(
                    `  - [${d.kind}] ${d.subject} ${d.customId} (${d.problemId}): ${d.detail}`,
                );
            }
            process.exitCode = 1;
            return;
        }

        console.log('[audit] OK: Problem.answer / acceptedAnswers は publishedRevision の正解カラムと完全に同期している');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
