/**
 * 英語問題の現状を多角的に集計する read-only スクリプト。
 *
 * 「PROD に解答未設定の英語問題が 3500 問近くある」というユーザー報告と
 * extract-english-unanswered.ts の抽出結果が食い違ったため、status /
 * hasStructuredContent / publishedRevisionId / answer / correctAnswer の
 * クロス集計で実態を把握する。使い捨ての診断スクリプト。
 *
 * 使い方:
 *   tsx scripts/inspect-english-problems.ts --env production
 *   tsx scripts/inspect-english-problems.ts --env dev
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProblemStatus } from '@prisma/client';

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

async function main() {
    const argv = process.argv.slice(2);
    const envIdx = argv.indexOf('--env');
    const envValue = envIdx >= 0 ? argv[envIdx + 1] : 'dev';
    if (envValue !== 'dev' && envValue !== 'production') {
        throw new Error('--env には dev か production');
    }
    const env: EnvName = envValue;
    const envFile = envFileFor(env);
    if (!existsSync(envFile)) throw new Error(`env file not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    const prisma = await loadPrisma();
    try {
        const subjects = await prisma.subject.findMany({
            select: { id: true, name: true, _count: { select: { problems: true } } },
        });
        console.log('--- Subjects (全教科) ---');
        for (const s of subjects) {
            console.log(`  ${s.name} (id=${s.id}): problems=${s._count.problems}`);
        }

        const en = subjects.find((s) => s.name === '英語');
        if (!en) {
            console.log('\nSubject "英語" が見つかりません');
            return;
        }

        console.log('\n--- 英語 status 別 ---');
        const byStatus = await prisma.problem.groupBy({
            by: ['status'],
            where: { subjectId: en.id },
            _count: true,
        });
        for (const r of byStatus) {
            console.log(`  ${r.status}: ${r._count}`);
        }

        console.log('\n--- 英語 hasStructuredContent 別 ---');
        const byStructured = await prisma.problem.groupBy({
            by: ['hasStructuredContent'],
            where: { subjectId: en.id },
            _count: true,
        });
        for (const r of byStructured) {
            console.log(`  hasStructuredContent=${r.hasStructuredContent}: ${r._count}`);
        }

        console.log('\n--- 英語 publishedRevisionId 有無 × status ---');
        const statuses: ProblemStatus[] = ['DRAFT', 'PUBLISHED', 'SENT_BACK'];
        for (const status of statuses) {
            const withRev = await prisma.problem.count({
                where: { subjectId: en.id, status, publishedRevisionId: { not: null } },
            });
            const noRev = await prisma.problem.count({
                where: { subjectId: en.id, status, publishedRevisionId: null },
            });
            console.log(`  ${status}: with-rev=${withRev}, no-rev=${noRev}`);
        }

        console.log('\n--- 英語 Problem.answer 未設定 (status 別) ---');
        const noAnswerTotal = await prisma.problem.count({
            where: { subjectId: en.id, OR: [{ answer: null }, { answer: '' }] },
        });
        console.log(`  全 status 合計: ${noAnswerTotal}`);
        for (const status of statuses) {
            const c = await prisma.problem.count({
                where: {
                    subjectId: en.id,
                    status,
                    OR: [{ answer: null }, { answer: '' }],
                },
            });
            console.log(`    ${status}: ${c}`);
        }

        console.log('\n--- 英語 publishedRevision.correctAnswer 未設定 (公開済みのみ) ---');
        const revNoCorrect = await prisma.problem.count({
            where: {
                subjectId: en.id,
                publishedRevisionId: { not: null },
                publishedRevision: { OR: [{ correctAnswer: null }, { correctAnswer: '' }] },
            },
        });
        console.log(`  ${revNoCorrect}`);

        console.log('\n--- 英語 status=PUBLISHED かつ answer 空 のサンプル (5 件) ---');
        const samples = await prisma.problem.findMany({
            where: {
                subjectId: en.id,
                status: 'PUBLISHED',
                OR: [{ answer: null }, { answer: '' }],
            },
            select: {
                customId: true,
                status: true,
                hasStructuredContent: true,
                publishedRevisionId: true,
                answer: true,
            },
            take: 5,
            orderBy: { customIdSortKey: 'asc' },
        });
        for (const s of samples) {
            console.log(
                `  ${s.customId}: hasStructured=${s.hasStructuredContent}, pubRev=${s.publishedRevisionId ? 'yes' : 'no'}, answer="${s.answer ?? '(null)'}"`,
            );
        }

        console.log('\n--- 英語 publishedRevisionId IS NULL の問題 (status 問わず, 5 件) ---');
        const noPubSamples = await prisma.problem.findMany({
            where: { subjectId: en.id, publishedRevisionId: null },
            select: {
                customId: true,
                status: true,
                hasStructuredContent: true,
                answer: true,
            },
            take: 5,
            orderBy: { customIdSortKey: 'asc' },
        });
        for (const s of noPubSamples) {
            console.log(
                `  ${s.customId}: status=${s.status}, hasStructured=${s.hasStructuredContent}, answer="${s.answer ?? '(null)'}"`,
            );
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('failed:', err);
    process.exitCode = 1;
});
