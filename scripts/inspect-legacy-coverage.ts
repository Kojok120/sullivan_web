/**
 * legacy フィールド (Problem.question / answer / acceptedAnswers) を
 * 撤廃する前提で、structuredContent が無いレコードや legacy のみ参照しないと
 * いけないレコードがどれだけあるかを集計する read-only スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/inspect-legacy-coverage.ts --env production
 */
import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
    const argv = process.argv.slice(2);
    const envIdx = argv.indexOf('--env');
    const env = envIdx >= 0 ? argv[envIdx + 1] : 'production';
    const envFile = resolve(__dirname, '..', env === 'production' ? '.env.PRODUCTION' : '.env.DEV');
    if (!existsSync(envFile)) throw new Error(`env not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });
    const { prisma } = await import('../src/lib/prisma');

    try {
        const subjects = await prisma.subject.findMany({ select: { id: true, name: true } });
        console.log(`env: ${env}\n`);

        console.log('=== 全問題の status × hasStructuredContent × publishedRevisionId ===');
        for (const s of subjects) {
            const total = await prisma.problem.count({ where: { subjectId: s.id } });
            const structTrue = await prisma.problem.count({ where: { subjectId: s.id, hasStructuredContent: true } });
            const structFalse = await prisma.problem.count({ where: { subjectId: s.id, hasStructuredContent: false } });
            const withPub = await prisma.problem.count({ where: { subjectId: s.id, publishedRevisionId: { not: null } } });
            const withoutPub = await prisma.problem.count({ where: { subjectId: s.id, publishedRevisionId: null } });
            console.log(`  ${s.name}: total=${total}  hasStructured(true=${structTrue} / false=${structFalse})  pubRev(yes=${withPub} / no=${withoutPub})`);
        }

        console.log('\n=== publishedRevision なしの問題 × hasStructuredContent ===');
        const noPubButStruct = await prisma.problem.count({
            where: { publishedRevisionId: null, hasStructuredContent: true },
        });
        const noPubNoStruct = await prisma.problem.count({
            where: { publishedRevisionId: null, hasStructuredContent: false },
        });
        console.log(`  publishedRevisionId IS NULL かつ hasStructuredContent=true: ${noPubButStruct}`);
        console.log(`  publishedRevisionId IS NULL かつ hasStructuredContent=false: ${noPubNoStruct}`);

        // structuredContent (JSON) を実際に持つ revision が無いケース
        console.log('\n=== publishedRevision あり かつ structuredContent IS NULL ===');
        const pubRevNullStruct = await prisma.problemRevision.count({
            where: {
                publishedForProblem: { isNot: null },
                structuredContent: { equals: undefined as never } as never,
            },
        });
        const pubRevNullStruct2 = await prisma.problem.count({
            where: {
                publishedRevisionId: { not: null },
                publishedRevision: { structuredContent: { equals: undefined as never } as never },
            },
        });
        console.log(`  (revision側 count): ${pubRevNullStruct}`);
        console.log(`  (problem側 count):  ${pubRevNullStruct2}`);

        // publishedRevision が無くても "latest" DRAFT revision に structuredContent がある問題は何件か
        console.log('\n=== publishedRevision なし & 何らかの revision に structuredContent あり ===');
        const noPubButRevStruct = await prisma.problem.count({
            where: {
                publishedRevisionId: null,
                revisions: { some: { structuredContent: { not: undefined as never } as never } },
            },
        });
        console.log(`  ${noPubButRevStruct}`);

        // 完全 legacy: revisions が 0 件かつ hasStructuredContent=false な問題
        console.log('\n=== 完全 legacy (revisions=0 & hasStructuredContent=false) ===');
        const fullyLegacy = await prisma.problem.count({
            where: {
                hasStructuredContent: false,
                revisions: { none: {} },
            },
        });
        console.log(`  ${fullyLegacy}`);

        // 教科ごとに完全 legacy の内訳
        for (const s of subjects) {
            const cnt = await prisma.problem.count({
                where: {
                    subjectId: s.id,
                    hasStructuredContent: false,
                    revisions: { none: {} },
                },
            });
            console.log(`    ${s.name}: ${cnt}`);
        }

        console.log('\n=== Problem.answer が null/空 (status 問わず) ===');
        const noAnswerTotal = await prisma.problem.count({
            where: { OR: [{ answer: null }, { answer: '' }] },
        });
        console.log(`  ${noAnswerTotal}`);

        console.log('\n=== Problem.acceptedAnswers が空配列 ===');
        const emptyAccepted = await prisma.problem.count({ where: { acceptedAnswers: { isEmpty: true } } });
        console.log(`  ${emptyAccepted}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
