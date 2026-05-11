/**
 * 全 Problem に対し、編集画面で問題文・解答が表示されるように
 * ProblemRevision.structuredContent と answerSpec を Problem.question / answer から
 * バックフィルするスクリプト。
 *
 * - DRAFT revision が無ければ revisionNumber=次番号 で新規作成
 * - DRAFT revision があり structuredContent が空 (paragraph.text が無い等) なら更新
 * - structuredContent が既に埋まっている revision は触らない
 * - figure 付き問題の authoringTool / authoringState / 関連 ProblemAsset は保持
 *
 * 実行は冪等。
 *
 * 使い方:
 *   tsx scripts/backfill-problem-revisions.ts                          # 確認プロンプトあり (.env.DEV)
 *   tsx scripts/backfill-problem-revisions.ts --dry-run                # 集計のみ
 *   tsx scripts/backfill-problem-revisions.ts --yes                    # 確認スキップ
 *   tsx scripts/backfill-problem-revisions.ts --subject 数学            # 特定 Subject に絞る
 *   tsx scripts/backfill-problem-revisions.ts --env production         # .env.PRODUCTION から接続情報を読む
 *
 * 接続先 DB は --env で切り替える。既定は dev (=.env.DEV)。
 * 本番接続は必ず --env production を明示すること。
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { buildDefaultStructuredDraft } from '../src/lib/structured-problem';

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
    dryRun: boolean;
    yes: boolean;
    subjectName: string | null;
    env: EnvName;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = { dryRun: false, yes: false, subjectName: null, env: 'dev' };
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
            case '--subject':
                opts.subjectName = argv[i + 1] ?? null;
                i += 1;
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

// structuredContent が「中身を持つ」と判定できるか。
// paragraph テキスト、KaTeX、表など何かしら表示要素があれば true。
function isStructuredContentMeaningful(sc: unknown): boolean {
    if (!sc || typeof sc !== 'object') return false;
    const blocks = (sc as { blocks?: unknown[] }).blocks;
    if (!Array.isArray(blocks)) return false;
    return blocks.some((b) => {
        if (!b || typeof b !== 'object') return false;
        const block = b as {
            type?: string;
            text?: string;
            latex?: string;
            rows?: unknown[];
            options?: unknown[];
            blanks?: unknown[];
            assetId?: string;
            svg?: string;
            source?: string;
        };
        if (block.type === 'paragraph' && typeof block.text === 'string' && block.text.trim().length > 0) return true;
        if ((block.type === 'katexInline' || block.type === 'katexDisplay') && typeof block.latex === 'string' && block.latex.trim().length > 0) return true;
        if (block.type === 'table' && Array.isArray(block.rows) && block.rows.length > 0) return true;
        if (block.type === 'choices' && Array.isArray(block.options) && block.options.length > 0) return true;
        if (block.type === 'blankGroup' && Array.isArray(block.blanks) && block.blanks.length > 0) return true;
        if ((block.type === 'image' || block.type === 'svg') && typeof block.assetId === 'string' && block.assetId.length > 0) return true;
        if (block.type === 'svg' && typeof block.svg === 'string' && block.svg.length > 0) return true;
        // 図版だけを持つ問題を空扱いにすると、本スクリプトが directive ブロックを paragraph 1 件で
        // 上書きしてしまう（PR #150 で directive ブロックが追加された）。
        if (block.type === 'directive' && typeof block.source === 'string' && block.source.trim().length > 0) return true;
        return false;
    });
}

interface PlanRow {
    problemId: string;
    customId: string;
    subjectName: string;
    action: 'create' | 'update' | 'skip';
    reason: string;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(opts.env);
    if (!existsSync(envFile)) {
        throw new Error(`env ファイルが見つかりません: ${envFile}`);
    }
    loadDotenv({ path: envFile, override: true });

    const databaseUrl = process.env.DATABASE_URL;
    console.log('--- ProblemRevision バックフィル ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(databaseUrl)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const prisma = await loadPrisma();
    try {
        const where = opts.subjectName ? { subject: { name: opts.subjectName } } : {};
        const problems = await prisma.problem.findMany({
            where,
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                acceptedAnswers: true,
                problemType: true,
                hasStructuredContent: true,
                subject: { select: { name: true } },
                revisions: {
                    where: { status: 'DRAFT' },
                    orderBy: { revisionNumber: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        revisionNumber: true,
                        structuredContent: true,
                        answerSpec: true,
                        authoringTool: true,
                    },
                },
            },
        });

        console.log(`\n対象 Problem: ${problems.length} 件`);

        const plan: PlanRow[] = [];
        for (const p of problems) {
            const draft = p.revisions[0];
            if (!draft) {
                plan.push({
                    problemId: p.id,
                    customId: p.customId,
                    subjectName: p.subject.name,
                    action: 'create',
                    reason: 'DRAFT revision がありません',
                });
                continue;
            }
            if (!isStructuredContentMeaningful(draft.structuredContent)) {
                plan.push({
                    problemId: p.id,
                    customId: p.customId,
                    subjectName: p.subject.name,
                    action: 'update',
                    reason: 'structuredContent が空テンプレ',
                });
                continue;
            }
            plan.push({
                problemId: p.id,
                customId: p.customId,
                subjectName: p.subject.name,
                action: 'skip',
                reason: '既に埋まっています',
            });
        }

        const summary = plan.reduce((acc, row) => {
            const key = `${row.subjectName}/${row.action}`;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log('\n[集計] (subject/action 別)');
        for (const [k, v] of Object.entries(summary).sort()) {
            console.log(`  ${k}: ${v}`);
        }

        const targets = plan.filter((row) => row.action !== 'skip');
        console.log(`\n処理対象: ${targets.length} 件 (作成=${targets.filter((t) => t.action === 'create').length}, 更新=${targets.filter((t) => t.action === 'update').length})`);

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }
        if (targets.length === 0) {
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

        const problemById = new Map(problems.map((p) => [p.id, p]));
        let processed = 0;

        for (const row of targets) {
            const p = problemById.get(row.problemId);
            if (!p) continue;

            const draft = buildDefaultStructuredDraft(p.problemType);
            const document = {
                ...draft.document,
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'paragraph' as const,
                        text: p.question,
                    },
                ],
            };
            // Stage B' 以降、正解情報は revision 専用カラムに保存し、
            // answerSpec JSON は answerTemplate のみを保持する形に縮小済み。
            const answerSpec: Record<string, never> = {};

            // 1 問題分の revision 作成/更新と problem.hasStructuredContent 更新は 1 単位で
            // 成功/失敗すべき。途中失敗で hasStructuredContent だけ true に切り替わると
            // 編集画面が空表示になる。create 経路の aggregate→create も同一トランザクション
            // 内で行うことで revisionNumber の競合を抑える。
            await prisma.$transaction(async (tx) => {
                if (row.action === 'update') {
                    const existing = p.revisions[0];
                    await tx.problemRevision.update({
                        where: { id: existing.id },
                        data: {
                            structuredContent: document as unknown as Prisma.InputJsonValue,
                            answerSpec: answerSpec as unknown as Prisma.InputJsonValue,
                            correctAnswer: p.answer ?? null,
                            acceptedAnswers: { set: p.acceptedAnswers ?? [] },
                        },
                    });
                } else {
                    const maxRev = await tx.problemRevision.aggregate({
                        where: { problemId: p.id },
                        _max: { revisionNumber: true },
                    });
                    const revisionNumber = (maxRev._max.revisionNumber ?? 0) + 1;
                    await tx.problemRevision.create({
                        data: {
                            problemId: p.id,
                            revisionNumber,
                            status: 'DRAFT',
                            structuredContent: document as unknown as Prisma.InputJsonValue,
                            answerSpec: answerSpec as unknown as Prisma.InputJsonValue,
                            correctAnswer: p.answer ?? null,
                            acceptedAnswers: p.acceptedAnswers ?? [],
                            printConfig: draft.printConfig as unknown as Prisma.InputJsonValue,
                            authoringTool: 'MANUAL',
                        },
                    });
                }

                if (!p.hasStructuredContent) {
                    await tx.problem.update({
                        where: { id: p.id },
                        data: {
                            hasStructuredContent: true,
                        },
                    });
                }
            });

            processed += 1;
            if (processed % 50 === 0) {
                console.log(`  ${processed}/${targets.length} 件処理...`);
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
