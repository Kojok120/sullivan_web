/**
 * 1問単位で ProblemRevision.structuredContent を JSON ファイル入力で上書きする書き換えスクリプト。
 *
 * 想定ワークフロー:
 *   1. 私 or サブエージェントが新しい structuredContent JSON を tmp/edits/<customId>.json に書く
 *   2. このスクリプトを --dry-run で流して diff を確認
 *   3. --yes で適用
 *
 * 安全装置:
 *   - 対象は customId に一致する Problem が「単一」かつ「PUBLISHED 無し（DRAFT のみ）」のときだけ既定で許可
 *     （PUBLISHED 済みを上書きしたい場合は --allow-published を明示）
 *   - 上書き前に既存 structuredContent をバックアップ JSON として tmp/backups/ に書き出す
 *   - parseStructuredDocument で zod 検証してから commit
 *   - Problem.question / answer / acceptedAnswers も deriveLegacyFieldsFromStructuredData で再導出
 *
 * 使い方:
 *   tsx scripts/apply-structured-content.ts --env dev --custom-id M-1068 --input tmp/edits/M-1068.json --dry-run
 *   tsx scripts/apply-structured-content.ts --env production --custom-id M-1068 --input tmp/edits/M-1068.json --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
    deriveLegacyFieldsFromStructuredData,
    parseStructuredDocument,
} from '../src/lib/structured-problem';

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
    customId: string | null;
    inputPath: string | null;
    dryRun: boolean;
    yes: boolean;
    allowPublished: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        env: 'dev', customId: null, inputPath: null,
        dryRun: false, yes: false, allowPublished: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--env': {
                const v = argv[i + 1];
                if (v !== 'dev' && v !== 'production') throw new Error(`--env: ${v}`);
                opts.env = v;
                i += 1;
                break;
            }
            case '--custom-id':
                opts.customId = argv[i + 1] ?? null;
                i += 1;
                break;
            case '--input':
                opts.inputPath = argv[i + 1] ?? null;
                i += 1;
                break;
            case '--dry-run':
                opts.dryRun = true;
                break;
            case '--yes':
            case '-y':
                opts.yes = true;
                break;
            case '--allow-published':
                opts.allowPublished = true;
                break;
            default:
                if (arg?.startsWith('--')) throw new Error(`未知のオプション: ${arg}`);
        }
    }
    if (!opts.customId) throw new Error('--custom-id を指定してください');
    if (!opts.inputPath) throw new Error('--input を指定してください');
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
    if (!existsSync(envFile)) throw new Error(`env ファイルが見つかりません: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    console.log('--- structuredContent 上書きスクリプト ---');
    console.log(`env: ${opts.env} (${envFile})`);
    console.log(`接続先 DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`customId: ${opts.customId}`);
    console.log(`input:    ${opts.inputPath}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    const inputAbsPath = resolve(process.cwd(), opts.inputPath!);
    if (!existsSync(inputAbsPath)) throw new Error(`入力ファイルが存在しません: ${inputAbsPath}`);
    const newDocumentRaw = JSON.parse(readFileSync(inputAbsPath, 'utf8'));
    // zod 検証（壊れた JSON を流し込まない）
    const newDocument = parseStructuredDocument(newDocumentRaw);

    const prisma = await loadPrisma();
    try {
        const problems = await prisma.problem.findMany({
            where: { customId: opts.customId! },
            select: {
                id: true,
                customId: true,
                question: true,
                answer: true,
                acceptedAnswers: true,
                publishedRevisionId: true,
                subject: { select: { name: true } },
            },
        });
        if (problems.length === 0) {
            throw new Error(`customId に一致する Problem が見つかりません: ${opts.customId}`);
        }
        if (problems.length > 1) {
            throw new Error(`customId が複数の Problem に一致します（${problems.length} 件）。subject 等で一意化が必要。`);
        }
        const problem = problems[0];
        const isPublished = !!problem.publishedRevisionId;
        if (isPublished && !opts.allowPublished) {
            throw new Error('対象は PUBLISHED 済みです。--allow-published を明示してください。');
        }

        // 直近の DRAFT (revisionNumber 最大) を更新対象にする。
        // PUBLISHED 済み問題で --allow-published 指定時は publishedRevision を直接更新する。
        let targetRevision;
        if (isPublished && opts.allowPublished) {
            targetRevision = await prisma.problemRevision.findUnique({
                where: { id: problem.publishedRevisionId! },
                select: {
                    id: true, revisionNumber: true, status: true,
                    structuredContent: true, answerSpec: true,
                    correctAnswer: true, acceptedAnswers: true, printConfig: true,
                },
            });
        } else {
            targetRevision = await prisma.problemRevision.findFirst({
                where: { problemId: problem.id, status: 'DRAFT' },
                orderBy: { revisionNumber: 'desc' },
                select: {
                    id: true, revisionNumber: true, status: true,
                    structuredContent: true, answerSpec: true,
                    correctAnswer: true, acceptedAnswers: true, printConfig: true,
                },
            });
        }
        if (!targetRevision) {
            throw new Error('更新対象の revision が見つかりません（DRAFT が無い）');
        }
        console.log(`\n対象: ${problem.subject.name}/${problem.customId} rev=${targetRevision.revisionNumber} (${targetRevision.status})`);

        // Stage B' 以降、正解情報は ProblemRevision の専用カラムから読み、
        // legacy Problem.* は document + 正解専用カラムから再導出する。
        const derived = deriveLegacyFieldsFromStructuredData({
            document: newDocument,
            correctAnswer: targetRevision.correctAnswer ?? '',
            acceptedAnswers: targetRevision.acceptedAnswers ?? [],
        });

        console.log('\n--- diff ---');
        console.log('[Problem.question]');
        console.log('  before:', JSON.stringify(problem.question));
        console.log('  after: ', JSON.stringify(derived.question));
        console.log('[structuredContent.blocks]');
        const beforeBlocks = (targetRevision.structuredContent as { blocks?: unknown[] } | null)?.blocks ?? [];
        const afterBlocks = newDocument.blocks;
        console.log(`  before: ${beforeBlocks.length} ブロック`);
        console.log(`  after:  ${afterBlocks.length} ブロック`);
        console.log('  before(raw):', JSON.stringify(targetRevision.structuredContent, null, 2).slice(0, 800));
        console.log('  after(raw): ', JSON.stringify(newDocument, null, 2).slice(0, 800));

        if (opts.dryRun) {
            console.log('\n--dry-run のため終了します');
            return;
        }

        if (!opts.yes) {
            const ok = await confirmInteractive('上記を反映します。続行しますか？');
            if (!ok) {
                console.log('キャンセルしました');
                return;
            }
        }

        // バックアップ書き出し
        const backupDir = resolve(__dirname, '..', 'tmp', 'backups');
        if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = resolve(backupDir, `structured-${opts.env}-${problem.customId}-rev${targetRevision.revisionNumber}-${ts}.json`);
        writeFileSync(backupPath, JSON.stringify({
            problemId: problem.id,
            customId: problem.customId,
            revisionId: targetRevision.id,
            revisionNumber: targetRevision.revisionNumber,
            status: targetRevision.status,
            previous: {
                problem: {
                    question: problem.question,
                    answer: problem.answer,
                    acceptedAnswers: problem.acceptedAnswers,
                },
                structuredContent: targetRevision.structuredContent,
            },
        }, null, 2), 'utf8');
        console.log(`\nバックアップ: ${backupPath}`);

        await prisma.$transaction(async (tx) => {
            await tx.problemRevision.update({
                where: { id: targetRevision!.id },
                data: { structuredContent: newDocument as object },
            });
            await tx.problem.update({
                where: { id: problem.id },
                data: {
                    question: derived.question,
                    answer: derived.answer,
                    acceptedAnswers: { set: derived.acceptedAnswers },
                    hasStructuredContent: true,
                },
            });
        });

        console.log('完了');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
