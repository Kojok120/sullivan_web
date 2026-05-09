/**
 * 数学100問 (中1〜中3 全範囲) を DRAFT で投入するスクリプト。
 *
 * 使い方:
 *   npm run seed:math-dev              # 通常実行 (削除確認プロンプトあり)
 *   npm run seed:math-dev -- --yes     # プロンプトをスキップして自動削除
 *   npm run seed:math-dev -- --dry-run # DB に書き込まず、削除/投入予定をサマリ表示
 *   npm run seed:math-dev -- --skip-delete  # 既存データ削除をスキップして投入のみ
 *   npm run seed:math-dev -- --skip-insert  # 削除のみ実行
 *   npm run seed:math-dev -- --rollback     # 直近投入分の Problem を削除
 *   npm run seed:math-dev -- --export-review-csv ./review.csv  # レビュー用 CSV 出力
 *   npm run seed:math-dev -- --export-figures-html ./figures.html  # 図形プレビュー HTML 出力
 *   npm run seed:math-dev -- --env production               # .env.PRODUCTION から接続情報を読む (本番投入)
 *
 * 接続先 DB は --env で切り替える。既定は dev (=.env.DEV)。
 * 本番投入する場合は本スクリプトを直接呼ばず scripts/seed-math-problems-production.ts (または
 * `npm run seed:math-prod`) を経由すること。
 */

import { Prisma } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
    CORE_PROBLEMS,
    MATH_PROBLEMS,
    summarizeProblemDistribution,
    getCoreProblemByMaster,
    type CoreProblemDef,
    type MathProblemDef,
} from './data/math-problems-dev';
import { buildDefaultStructuredDraft } from '../src/lib/structured-problem';
import { randomUUID } from 'node:crypto';

type EnvName = 'dev' | 'production';

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function detectEnvFromArgv(argv: string[]): EnvName {
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--env') {
            const value = argv[i + 1];
            if (value !== 'dev' && value !== 'production') {
                console.error(`--env には dev か production を指定してください (received: ${value ?? '(none)'})`);
                process.exit(1);
            }
            return value;
        }
    }
    return 'dev';
}

const SELECTED_ENV: EnvName = detectEnvFromArgv(process.argv.slice(2));
const ENV_FILE = envFileFor(SELECTED_ENV);
const SUBJECT_NAMES_TO_RESET = ['数学', '理科'] as const;
const TARGET_SUBJECT_NAME = '数学' as const;
const CUSTOM_ID_PREFIX = 'M' as const;
const SCRIPT_DATA_DIR = resolve(__dirname, 'data');
const LAST_RUN_LOG_PATH = resolve(SCRIPT_DATA_DIR, 'math-problems-dev.last-run.json');

// 誤って .env (本番接続情報の可能性) にフォールバックしないように、選択した env ファイルを必須化し
// `dotenv/config` の暗黙ロードは行わない。
if (!existsSync(ENV_FILE)) {
    console.error(`env ファイルが見つかりません: ${ENV_FILE}`);
    console.error(`--env=${SELECTED_ENV} 用の env ファイルを用意してから再実行してください。`);
    process.exit(1);
}
loadDotenv({ path: ENV_FILE, override: true });

// seed は 566 件規模の Problem create を 1 transaction でまとめるため、pooler (PgBouncer) の
// long transaction の挙動を避ける目的で DIRECT_URL があればそちらを使う。
if (process.env.DIRECT_URL && process.env.DIRECT_URL !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
    console.log('[note] DATABASE_URL を DIRECT_URL に切り替えました (long transaction 用)');
}

// 動的 import: env 反映後に prisma シングルトンを生成させる。
async function loadPrisma() {
    const mod = await import('../src/lib/prisma');
    return mod.prisma;
}

interface CliOptions {
    dryRun: boolean;
    yes: boolean;
    skipDelete: boolean;
    skipInsert: boolean;
    rollback: boolean;
    exportReviewCsv: string | null;
    exportFiguresHtml: string | null;
}

function parseCliArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        dryRun: false,
        yes: false,
        skipDelete: false,
        skipInsert: false,
        rollback: false,
        exportReviewCsv: null,
        exportFiguresHtml: null,
    };

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
            case '--skip-delete':
                opts.skipDelete = true;
                break;
            case '--skip-insert':
                opts.skipInsert = true;
                break;
            case '--rollback':
                opts.rollback = true;
                break;
            case '--export-review-csv':
                opts.exportReviewCsv = argv[i + 1] ?? null;
                i += 1;
                break;
            case '--export-figures-html':
                opts.exportFiguresHtml = argv[i + 1] ?? null;
                i += 1;
                break;
            case '--env':
                // SELECTED_ENV で消費済みだが、引数自体はここで読み飛ばす
                i += 1;
                break;
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

interface DeletionPlan {
    subjectIds: string[];
    problemCount: number;
    coreProblemCount: number;
    learningHistoryCount: number;
    userProblemStateCount: number;
    revisionCount: number;
    assetCount: number;
    userCoreProblemStateCount: number;
}

async function buildDeletionPlan(prisma: Awaited<ReturnType<typeof loadPrisma>>): Promise<DeletionPlan> {
    const subjects = await prisma.subject.findMany({
        where: { name: { in: [...SUBJECT_NAMES_TO_RESET] } },
        select: { id: true, name: true },
    });

    const subjectIds = subjects.map((s) => s.id);
    if (subjectIds.length === 0) {
        return {
            subjectIds: [],
            problemCount: 0,
            coreProblemCount: 0,
            learningHistoryCount: 0,
            userProblemStateCount: 0,
            revisionCount: 0,
            assetCount: 0,
            userCoreProblemStateCount: 0,
        };
    }

    const problemIds = (await prisma.problem.findMany({
        where: { subjectId: { in: subjectIds } },
        select: { id: true },
    })).map((p) => p.id);

    const coreProblemIds = (await prisma.coreProblem.findMany({
        where: { subjectId: { in: subjectIds } },
        select: { id: true },
    })).map((cp) => cp.id);

    const [
        coreProblemCount,
        learningHistoryCount,
        userProblemStateCount,
        revisionCount,
        assetCount,
        userCoreProblemStateCount,
    ] = await Promise.all([
        Promise.resolve(coreProblemIds.length),
        problemIds.length > 0 ? prisma.learningHistory.count({ where: { problemId: { in: problemIds } } }) : Promise.resolve(0),
        problemIds.length > 0 ? prisma.userProblemState.count({ where: { problemId: { in: problemIds } } }) : Promise.resolve(0),
        problemIds.length > 0 ? prisma.problemRevision.count({ where: { problemId: { in: problemIds } } }) : Promise.resolve(0),
        problemIds.length > 0
            ? prisma.problemAsset.count({ where: { problemRevision: { problemId: { in: problemIds } } } })
            : Promise.resolve(0),
        coreProblemIds.length > 0
            ? prisma.userCoreProblemState.count({ where: { coreProblemId: { in: coreProblemIds } } })
            : Promise.resolve(0),
    ]);

    return {
        subjectIds,
        problemCount: problemIds.length,
        coreProblemCount,
        learningHistoryCount,
        userProblemStateCount,
        revisionCount,
        assetCount,
        userCoreProblemStateCount,
    };
}

async function snapshotForBackup(
    prisma: Awaited<ReturnType<typeof loadPrisma>>,
    subjectIds: string[],
    outPath: string,
) {
    const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true, order: true },
    });

    const coreProblems = await prisma.coreProblem.findMany({
        where: { subjectId: { in: subjectIds } },
        orderBy: [{ subjectId: 'asc' }, { masterNumber: 'asc' }],
    });

    const problems = await prisma.problem.findMany({
        where: { subjectId: { in: subjectIds } },
        include: {
            revisions: { include: { assets: true } },
            coreProblems: { select: { id: true, masterNumber: true } },
        },
        orderBy: [{ subjectId: 'asc' }, { customId: 'asc' }],
    });

    const payload = {
        snapshotAt: new Date().toISOString(),
        subjects,
        coreProblems,
        problems,
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function executeDeletion(
    prisma: Awaited<ReturnType<typeof loadPrisma>>,
    subjectIds: string[],
) {
    const result = await prisma.$transaction(async (tx) => {
        const deletedProblems = await tx.problem.deleteMany({
            where: { subjectId: { in: subjectIds } },
        });
        // CoreProblem.userStates には onDelete: Cascade が無いため、先に明示削除する。
        const deletedUserCoreProblemStates = await tx.userCoreProblemState.deleteMany({
            where: { coreProblem: { subjectId: { in: subjectIds } } },
        });
        const deletedCoreProblems = await tx.coreProblem.deleteMany({
            where: { subjectId: { in: subjectIds } },
        });
        return { deletedProblems, deletedUserCoreProblemStates, deletedCoreProblems };
    });
    return result;
}

interface InsertedProblemLog {
    customId: string;
    masterNumber: number;
    unitMasterNumber: number;
    grade: string;
    problemType: string;
    title: string;
}

async function ensureSubject(prisma: Awaited<ReturnType<typeof loadPrisma>>) {
    const subject = await prisma.subject.findFirst({
        where: { name: TARGET_SUBJECT_NAME },
        select: { id: true, name: true, order: true },
    });
    if (!subject) {
        throw new Error(
            `Subject「${TARGET_SUBJECT_NAME}」が DEV DB に存在しません。先に prisma/seed.ts を実行してください。`,
        );
    }
    return subject;
}

async function upsertCoreProblems(
    prisma: Prisma.TransactionClient,
    subjectId: string,
    coreProblems: CoreProblemDef[],
) {
    const created: { id: string; masterNumber: number; name: string }[] = [];
    for (const def of coreProblems) {
        const record = await prisma.coreProblem.upsert({
            where: { subjectId_masterNumber: { subjectId, masterNumber: def.masterNumber } },
            update: { name: def.name, lectureVideos: undefined },
            create: {
                subjectId,
                masterNumber: def.masterNumber,
                name: def.name,
                order: def.masterNumber,
                lectureVideos: undefined,
            },
            select: { id: true, masterNumber: true, name: true },
        });
        created.push(record);
    }
    return created;
}

async function insertProblems(
    prisma: Prisma.TransactionClient,
    subjectId: string,
    coreProblemMap: Map<number, string>,
    problems: MathProblemDef[],
): Promise<InsertedProblemLog[]> {
    if (problems.length === 0) {
        return [];
    }

    const inserted: InsertedProblemLog[] = [];
    let nextMasterNumber = await getNextProblemMasterNumber(prisma, subjectId);
    let nextOrder = await getNextProblemOrder(prisma, subjectId);
    let nextCustomIdNumber = await getNextCustomIdNumber(prisma, subjectId);

    for (const def of problems) {
        const coreProblemId = coreProblemMap.get(def.unitMasterNumber);
        if (!coreProblemId) {
            throw new Error(`unitMasterNumber=${def.unitMasterNumber} の CoreProblem が未投入です`);
        }

        const customId = `${CUSTOM_ID_PREFIX}-${nextCustomIdNumber}`;
        const masterNumber = nextMasterNumber;
        const order = nextOrder;

        const created = await prisma.problem.create({
            data: {
                question: def.question,
                answer: def.answer,
                acceptedAnswers: def.acceptedAnswers ?? [],
                grade: def.grade,
                customId,
                masterNumber,
                order,
                problemType: def.problemType,
                contentFormat: 'STRUCTURED_V1',
                hasStructuredContent: true,
                status: 'DRAFT',
                subject: { connect: { id: subjectId } },
                coreProblems: { connect: [{ id: coreProblemId }] },
            },
        });
        if (!created || !created.id) {
            throw new Error(
                `prisma.problem.create が想定外の値を返しました (customId=${customId}, returned=${JSON.stringify(created)})`,
            );
        }

        await createProblemRevision(prisma, created.id, def);

        inserted.push({
            customId: created.customId,
            masterNumber,
            unitMasterNumber: def.unitMasterNumber,
            grade: def.grade,
            problemType: def.problemType,
            title: def.title ?? def.question.slice(0, 40),
        });

        nextMasterNumber += 1;
        nextOrder += 1;
        nextCustomIdNumber += 1;
    }

    return inserted;
}

async function createProblemRevision(
    prisma: Prisma.TransactionClient,
    problemId: string,
    def: MathProblemDef,
) {
    const draft = buildDefaultStructuredDraft(def.problemType);

    // 問題文 (LaTeX 込み) を paragraph ブロックとして格納し、
    // admin 編集画面で初期表示できるようにする。
    const document = {
        ...draft.document,
        blocks: [
            {
                id: randomUUID(),
                type: 'paragraph' as const,
                text: def.question,
            },
        ],
    };

    const answerSpec = {
        correctAnswer: def.answer ?? '',
        acceptedAnswers: def.acceptedAnswers ?? [],
    };

    // GeoGebra 連携を廃止したため、def.figure は seed では使わない。
    // 図版が必要な問題は admin UI で [[geometry]] / [[coordplane]] / [[numberline]] DSL に
    // 書き換える運用に移行済み。
    await prisma.problemRevision.create({
        data: {
            problemId,
            revisionNumber: 1,
            status: 'DRAFT',
            structuredContent: document as unknown as Prisma.InputJsonValue,
            answerSpec: answerSpec as unknown as Prisma.InputJsonValue,
            printConfig: draft.printConfig as unknown as Prisma.InputJsonValue,
            authoringTool: 'MANUAL',
            authoringState: Prisma.JsonNull,
        },
        select: { id: true },
    });
}

async function getNextProblemMasterNumber(
    prisma: Prisma.TransactionClient,
    subjectId: string,
) {
    const aggregate = await prisma.problem.aggregate({
        where: { subjectId },
        _max: { masterNumber: true },
    });
    return (aggregate._max.masterNumber ?? 0) + 1;
}

async function getNextProblemOrder(
    prisma: Prisma.TransactionClient,
    subjectId: string,
) {
    const aggregate = await prisma.problem.aggregate({
        where: { subjectId },
        _max: { order: true },
    });
    return (aggregate._max.order ?? 0) + 1;
}

async function getNextCustomIdNumber(
    prisma: Prisma.TransactionClient,
    subjectId: string,
) {
    const existing = await prisma.problem.findMany({
        where: { subjectId, customId: { startsWith: `${CUSTOM_ID_PREFIX}-` } },
        select: { customId: true },
    });
    let max = 0;
    for (const { customId } of existing) {
        const match = customId.match(/^M-(\d+)$/);
        if (match) {
            const n = Number.parseInt(match[1], 10);
            if (Number.isFinite(n) && n > max) {
                max = n;
            }
        }
    }
    return max + 1;
}

function writeRunLog(insertedLogs: InsertedProblemLog[]) {
    mkdirSync(SCRIPT_DATA_DIR, { recursive: true });
    const payload = {
        ranAt: new Date().toISOString(),
        problems: insertedLogs,
    };
    writeFileSync(LAST_RUN_LOG_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

async function performRollback(prisma: Awaited<ReturnType<typeof loadPrisma>>, opts: CliOptions) {
    if (!existsSync(LAST_RUN_LOG_PATH)) {
        console.log(`[rollback] ${LAST_RUN_LOG_PATH} が存在しません。`);
        return;
    }
    const log = JSON.parse(readFileSync(LAST_RUN_LOG_PATH, 'utf-8')) as {
        ranAt: string;
        problems: InsertedProblemLog[];
    };
    const customIds = log.problems.map((p) => p.customId);
    console.log(`[rollback] ${customIds.length} 件の Problem を削除します (ranAt=${log.ranAt})`);

    if (opts.dryRun) {
        console.log('[rollback] dry-run のため終了します');
        return;
    }
    if (!opts.yes) {
        const ok = await confirmInteractive('続行してよろしいですか？');
        if (!ok) {
            console.log('[rollback] キャンセルしました');
            return;
        }
    }
    const subject = await ensureSubject(prisma);
    const result = await prisma.problem.deleteMany({
        where: { subjectId: subject.id, customId: { in: customIds } },
    });
    console.log(`[rollback] 削除件数=${result.count}`);
}

async function exportReviewCsv(
    prisma: Awaited<ReturnType<typeof loadPrisma>>,
    outPath: string,
) {
    const subject = await ensureSubject(prisma);
    const problems = await prisma.problem.findMany({
        where: { subjectId: subject.id },
        include: { coreProblems: { select: { masterNumber: true, name: true } } },
        orderBy: [{ masterNumber: 'asc' }],
    });

    const header = [
        'customId',
        'masterNumber',
        'grade',
        'unit',
        'problemType',
        'status',
        'question',
        'answer',
        'acceptedAnswers',
    ];
    const rows = problems.map((p) => [
        p.customId,
        String(p.masterNumber ?? ''),
        p.grade ?? '',
        p.coreProblems.map((cp) => `${cp.masterNumber}:${cp.name}`).join(' / '),
        p.problemType,
        p.status,
        (p.question ?? '').replace(/\n/g, ' / '),
        (p.answer ?? '').replace(/\n/g, ' / '),
        (p.acceptedAnswers ?? []).join(' | '),
    ]);

    const csv = [header, ...rows]
        .map((row) => row.map((cell) => {
            const s = String(cell ?? '');
            if (/[",\n]/.test(s)) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        }).join(','))
        .join('\n');

    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), `\uFEFF${csv}`, 'utf-8');
    console.log(`[export-csv] ${problems.length} 件を ${outPath} に出力しました`);
}

async function exportFiguresHtml(outPath: string) {
    // GeoGebra 連携を廃止したため figure は seed では描画しない。
    // レガシー spec を JSON のまま参照したい場合のみ利用する。
    const figures = MATH_PROBLEMS
        .filter((p) => p.figure)
        .map((p, idx) => ({
            index: idx + 1,
            problemType: p.problemType,
            unit: p.unitMasterNumber,
            title: p.title ?? p.question.slice(0, 30),
            spec: p.figure!,
        }));

    const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Math Figures Preview</title>
<style>body{font-family:sans-serif;padding:16px;} .card{border:1px solid #ccc;margin:12px 0;padding:12px;}</style>
</head><body>
<h1>数学100問 図形プレビュー (${figures.length} 件)</h1>
<p>GeoGebra 連携は廃止済み。以下はレガシー spec の JSON ダンプ。新規問題は admin UI で [[geometry]] / [[coordplane]] / [[numberline]] DSL に書き換える運用。</p>
${figures.map((f) => `
<div class="card">
  <h3>#${f.index} [${f.problemType}] 単元 ${f.unit} - ${f.title}</h3>
  <pre>${JSON.stringify(f.spec, null, 2).replace(/[<>]/g, (c) => c === '<' ? '&lt;' : '&gt;')}</pre>
</div>
`).join('')}
</body></html>`;

    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), html, 'utf-8');
    console.log(`[export-html] ${figures.length} 件の figure spec を ${outPath} に出力しました`);
}

async function main() {
    const opts = parseCliArgs(process.argv.slice(2));
    const databaseUrl = process.env.DATABASE_URL;
    console.log('--- 数学100問 DEV 投入スクリプト ---');
    console.log(`接続先 DB: ${describeDatabaseUrl(databaseUrl)}`);
    console.log(`オプション: ${JSON.stringify(opts)}`);

    if (opts.exportFiguresHtml) {
        await exportFiguresHtml(opts.exportFiguresHtml);
        return;
    }

    const prisma = await loadPrisma();

    try {
        if (opts.rollback) {
            await performRollback(prisma, opts);
            return;
        }

        if (opts.exportReviewCsv) {
            await exportReviewCsv(prisma, opts.exportReviewCsv);
            return;
        }

        const distribution = summarizeProblemDistribution();
        console.log('\n[投入予定]');
        console.log(`  CoreProblem: ${CORE_PROBLEMS.length} 件`);
        console.log(`  Problem: ${distribution.total} 件`);
        if (distribution.total > 0) {
            console.log(`    grade 別: ${[...distribution.byGrade.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
            console.log(`    type 別: ${[...distribution.byType.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
            console.log(`    難易度別: ${[...distribution.byDifficulty.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
            console.log(`    単元別: ${[...distribution.byUnit.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }

        if (!opts.skipDelete) {
            const plan = await buildDeletionPlan(prisma);
            console.log('\n[削除予定 (Subject「数学」「理科」配下)]');
            console.log(`  subjects=${plan.subjectIds.length}`);
            console.log(`  Problem=${plan.problemCount}`);
            console.log(`  CoreProblem=${plan.coreProblemCount}`);
            console.log(`  関連 (cascade): LearningHistory=${plan.learningHistoryCount}, UserProblemState=${plan.userProblemStateCount}, ProblemRevision=${plan.revisionCount}, ProblemAsset=${plan.assetCount}`);
            console.log(`  関連 (明示削除): UserCoreProblemState=${plan.userCoreProblemStateCount}`);

            if (opts.dryRun) {
                console.log('\n[dry-run] DB 書き込みは行わず終了します');
                return;
            }

            if (plan.problemCount + plan.coreProblemCount > 0) {
                if (!opts.yes) {
                    const ok = await confirmInteractive('上記を削除して新規データを投入します。続行しますか？');
                    if (!ok) {
                        console.log('キャンセルしました');
                        return;
                    }
                }
                const snapshotPath = resolve(SCRIPT_DATA_DIR, `dev-deleted-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
                await snapshotForBackup(prisma, plan.subjectIds, snapshotPath);
                console.log(`[backup] ${snapshotPath} に削除前スナップショットを保存しました`);
                const result = await executeDeletion(prisma, plan.subjectIds);
                console.log(`[delete] Problem=${result.deletedProblems.count}, UserCoreProblemState=${result.deletedUserCoreProblemStates.count}, CoreProblem=${result.deletedCoreProblems.count}`);
            } else {
                console.log('[delete] 削除対象はありません');
            }
        } else {
            console.log('[delete] --skip-delete のため削除をスキップ');
            if (opts.dryRun) {
                console.log('[dry-run] DB 書き込みは行わず終了します');
                return;
            }
        }

        if (opts.skipInsert) {
            console.log('[insert] --skip-insert のため投入をスキップ');
            return;
        }

        const subject = await ensureSubject(prisma);
        console.log(`\n[insert] Subject「${subject.name}」(id=${subject.id}) に投入します`);

        // CoreProblem upsert と Problem 投入を 1 つのトランザクションでまとめ、
        // 途中で失敗した場合は CoreProblem の upsert もロールバックする。
        // 100 問規模の create があるためデフォルト 5s では不足する可能性があり、timeout を伸ばす。
        const inserted = await prisma.$transaction(
            async (tx) => {
                const upserted = await upsertCoreProblems(tx, subject.id, CORE_PROBLEMS);
                console.log(`[insert] CoreProblem upsert 完了: ${upserted.length} 件`);
                const coreProblemMap = new Map(upserted.map((c) => [c.masterNumber, c.id]));

                if (MATH_PROBLEMS.length === 0) {
                    console.log('[insert] MATH_PROBLEMS が空なので Problem 投入はスキップします');
                    return [] as InsertedProblemLog[];
                }

                const result = await insertProblems(tx, subject.id, coreProblemMap, MATH_PROBLEMS);
                console.log(`[insert] Problem 投入完了: ${result.length} 件`);
                return result;
            },
            { timeout: 600_000, maxWait: 30_000 },
        );

        if (inserted.length > 0) {
            writeRunLog(inserted);
            console.log(`[log] ${LAST_RUN_LOG_PATH} に投入ログを書き込みました`);

            const draftCount = await prisma.problem.count({
                where: { subjectId: subject.id, status: 'DRAFT' },
            });
            const totalCount = await prisma.problem.count({ where: { subjectId: subject.id } });
            console.log('\n[verify]');
            console.log(`  Subject「${subject.name}」配下の Problem 件数 (DRAFT/全): ${draftCount} / ${totalCount}`);
            for (const def of CORE_PROBLEMS) {
                const cnt = await prisma.problem.count({
                    where: { subjectId: subject.id, coreProblems: { some: { masterNumber: def.masterNumber } } },
                });
                console.log(`  単元 #${def.masterNumber} ${def.name}: ${cnt} 問`);
            }
        }

        console.log('\n--- 完了 ---');
    } finally {
        await prisma.$disconnect();
    }
}

// `getCoreProblemByMaster` を import 警告抑止のため利用 (将来の検証拡張枠)。
void getCoreProblemByMaster;

main().catch((err) => {
    console.error('スクリプトが失敗しました:', err);
    process.exitCode = 1;
});
