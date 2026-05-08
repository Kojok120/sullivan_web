/**
 * Problem.acceptedAnswers および ProblemRevision.answerSpec.acceptedAnswers から、
 * 正解（Problem.answer / answerSpec.correctAnswer）と一致する別解、
 * および同一配列内の重複を取り除くワンショットスクリプト。
 *
 * 背景: 過去データに「別解」として正解と全く同じ値が登録されているレコードが残っており、
 *       AI採点や印刷プレビューでノイズになる。trim 後の strict 等価で一致するもののみ削除する。
 *
 * - 値が変わるレコードのみ更新する
 * - 冪等（再実行しても結果が同じ）
 * - Problem.answer / Problem.acceptedAnswers と ProblemRevision.answerSpec の双方を見る
 * - answerSpec パースに失敗したリビジョンはスキップしてログのみ残す
 *
 * 使い方:
 *   tsx scripts/cleanup-duplicate-accepted-answers.ts                # 確認プロンプトあり
 *   tsx scripts/cleanup-duplicate-accepted-answers.ts --dry-run      # 集計のみ
 *   tsx scripts/cleanup-duplicate-accepted-answers.ts --yes          # 確認スキップ
 *
 * 接続先 DB は dotenv で .env.DEV から読み込む。
 * PROD 実行時は DATABASE_URL を明示的に指定して上書きすること。
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEV_ENV_FILE = resolve(__dirname, '..', '.env.DEV');
// 既に DATABASE_URL が指定されていればそちらを優先（PROD 実行時は明示的に上書きする運用）。
// 未指定の場合のみ .env.DEV をロードする。
if (!process.env.DATABASE_URL && existsSync(DEV_ENV_FILE)) {
    loadDotenv({ path: DEV_ENV_FILE });
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

/**
 * 配列から「correctAnswer と一致する要素」「空文字・空白のみ」「重複」を取り除く。
 * trim 後の strict 等価で比較。
 */
function dedupeAcceptedAnswers(
    acceptedAnswers: readonly string[],
    correctAnswer: string,
): { values: string[]; changed: boolean } {
    const trimmedCorrect = correctAnswer.trim();
    const seen = new Set<string>();
    const values: string[] = [];
    for (const raw of acceptedAnswers) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (trimmed === trimmedCorrect) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        values.push(trimmed);
    }
    const changed = values.length !== acceptedAnswers.length
        || values.some((value, index) => value !== acceptedAnswers[index]);
    return { values, changed };
}

interface AnswerSpecLike {
    correctAnswer: string;
    acceptedAnswers: string[];
    answerTemplate?: string;
}

/**
 * answerSpec を緩く読む（zodパースは使わない）。失敗時は null。
 */
function readAnswerSpec(raw: unknown): AnswerSpecLike | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const correctAnswer = typeof obj.correctAnswer === 'string' ? obj.correctAnswer : '';
    const acceptedAnswersRaw = obj.acceptedAnswers;
    if (!Array.isArray(acceptedAnswersRaw)) return null;
    const acceptedAnswers: string[] = [];
    for (const item of acceptedAnswersRaw) {
        if (typeof item !== 'string') return null;
        acceptedAnswers.push(item);
    }
    const answerTemplate = typeof obj.answerTemplate === 'string' ? obj.answerTemplate : undefined;
    return { correctAnswer, acceptedAnswers, answerTemplate };
}

function previewArray(values: readonly string[], limit = 5): string {
    const head = values.slice(0, limit).map((value) => JSON.stringify(value)).join(', ');
    const suffix = values.length > limit ? `, …(+${values.length - limit})` : '';
    return `[${head}${suffix}]`;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log('--- 別解と正解の重複クリーンアップ ---');
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const { prisma } = await import('../src/lib/prisma');
    try {
        const problems = await prisma.problem.findMany({
            select: {
                id: true,
                customId: true,
                answer: true,
                acceptedAnswers: true,
                revisions: {
                    select: {
                        id: true,
                        revisionNumber: true,
                        answerSpec: true,
                    },
                },
            },
            orderBy: { customId: 'asc' },
        });

        type ProblemUpdate = {
            id: string;
            customId: string;
            before: readonly string[];
            after: string[];
        };
        type RevisionUpdate = {
            id: string;
            problemCustomId: string;
            revisionNumber: number;
            beforeAccepted: readonly string[];
            afterAccepted: string[];
            // 既知キー（correctAnswer / acceptedAnswers / answerTemplate）以外が将来追加された場合でも
            // 黙って落とさないように、生の answerSpec をそのまま保持する。
            rawAnswerSpec: Record<string, unknown>;
        };

        const problemUpdates: ProblemUpdate[] = [];
        const revisionUpdates: RevisionUpdate[] = [];
        let parseFailures = 0;

        for (const problem of problems) {
            const correctAnswer = problem.answer ?? '';
            const dedupedProblem = dedupeAcceptedAnswers(problem.acceptedAnswers, correctAnswer);
            if (dedupedProblem.changed) {
                problemUpdates.push({
                    id: problem.id,
                    customId: problem.customId,
                    before: problem.acceptedAnswers,
                    after: dedupedProblem.values,
                });
            }

            for (const revision of problem.revisions) {
                if (revision.answerSpec === null || revision.answerSpec === undefined) continue;
                const rawSpec = revision.answerSpec;
                if (typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
                    parseFailures += 1;
                    console.warn(
                        `[skip] revision ${revision.id} (problem ${problem.customId} #${revision.revisionNumber}) の answerSpec が object ではありません`,
                    );
                    continue;
                }
                const spec = readAnswerSpec(rawSpec);
                if (!spec) {
                    parseFailures += 1;
                    console.warn(
                        `[skip] revision ${revision.id} (problem ${problem.customId} #${revision.revisionNumber}) の answerSpec をパースできません`,
                    );
                    continue;
                }
                const dedupedSpec = dedupeAcceptedAnswers(spec.acceptedAnswers, spec.correctAnswer);
                if (dedupedSpec.changed) {
                    revisionUpdates.push({
                        id: revision.id,
                        problemCustomId: problem.customId,
                        revisionNumber: revision.revisionNumber,
                        beforeAccepted: spec.acceptedAnswers,
                        afterAccepted: dedupedSpec.values,
                        rawAnswerSpec: rawSpec as Record<string, unknown>,
                    });
                }
            }
        }

        console.log(`\n総 problem: ${problems.length} 件`);
        console.log(`Problem.acceptedAnswers 修正対象: ${problemUpdates.length} 件`);
        console.log(`ProblemRevision.answerSpec 修正対象: ${revisionUpdates.length} 件`);
        if (parseFailures > 0) {
            console.log(`answerSpec パース失敗（スキップ）: ${parseFailures} 件`);
        }

        const sampleSize = 5;
        if (problemUpdates.length > 0) {
            console.log(`\n--- Problem 修正サンプル（先頭 ${Math.min(sampleSize, problemUpdates.length)} 件） ---`);
            for (const update of problemUpdates.slice(0, sampleSize)) {
                console.log(`  ${update.customId}: ${previewArray(update.before)} -> ${previewArray(update.after)}`);
            }
        }
        if (revisionUpdates.length > 0) {
            console.log(`\n--- Revision 修正サンプル（先頭 ${Math.min(sampleSize, revisionUpdates.length)} 件） ---`);
            for (const update of revisionUpdates.slice(0, sampleSize)) {
                console.log(
                    `  ${update.problemCustomId} #${update.revisionNumber}: ${previewArray(update.beforeAccepted)} -> ${previewArray(update.afterAccepted)}`,
                );
            }
        }

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }
        if (problemUpdates.length === 0 && revisionUpdates.length === 0) {
            console.log('対象なし。終了します');
            return;
        }

        if (!opts.yes) {
            const ok = await confirmInteractive('上記を更新します。続行しますか？');
            if (!ok) {
                console.log('キャンセルしました');
                return;
            }
        }

        let processedProblems = 0;
        for (const update of problemUpdates) {
            await prisma.problem.update({
                where: { id: update.id },
                data: { acceptedAnswers: update.after },
            });
            processedProblems += 1;
            if (processedProblems % 200 === 0) {
                console.log(`  Problem: ${processedProblems}/${problemUpdates.length} 件処理...`);
            }
        }

        let processedRevisions = 0;
        for (const update of revisionUpdates) {
            // 既存の answerSpec を保持し、acceptedAnswers のみを差し替える。
            // 既知キー以外の未知キーが含まれている場合でも落とさないため。
            const nextSpec: Record<string, unknown> = {
                ...update.rawAnswerSpec,
                acceptedAnswers: update.afterAccepted,
            };
            await prisma.problemRevision.update({
                where: { id: update.id },
                data: { answerSpec: nextSpec as Prisma.InputJsonValue },
            });
            processedRevisions += 1;
            if (processedRevisions % 200 === 0) {
                console.log(`  Revision: ${processedRevisions}/${revisionUpdates.length} 件処理...`);
            }
        }

        console.log(`\n完了: Problem ${processedProblems} 件、Revision ${processedRevisions} 件を更新しました`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
