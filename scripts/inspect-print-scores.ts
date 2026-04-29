/**
 * print-algo の現在のスコア式で「おまかせ印刷の候補プールがどう並ぶか」を
 * 指定生徒のリアルデータで再現するスクリプト。
 *
 * スコア式 (src/lib/print-algo.ts:115-135):
 *   未着手: 100 * WEIGHT_UNANSWERED - problem.order * 0.1   = 150 - order*0.1
 *   既着手: diffDays * FORGETTING_RATE * WEIGHT_TIME         = diffDays * 10
 *
 * 出力:
 *   1. 現プールのスコア分布(ヒストグラム)
 *   2. スコア上位30件 (≒1回の印刷で選ばれる)
 *   3. CoreProblem 別の「未着手スコア / 印刷上位30入り件数」
 *   4. #21 前置詞の未着手24問の order とスコアおよび順位
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface CliOptions { name: string; env: 'DEV' | 'PRODUCTION'; topN: number; }
function parseArgs(argv: string[]): CliOptions {
    const o: CliOptions = { name: '', env: 'DEV', topN: 30 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if ((a === '--name' || a === '-n') && argv[i + 1]) { o.name = argv[i + 1]; i++; }
        else if (a === '--env' && argv[i + 1]) { const v = argv[i + 1].toUpperCase(); if (v === 'PRODUCTION' || v === 'DEV') o.env = v; i++; }
        else if (a === '--top' && argv[i + 1]) { o.topN = Number(argv[i + 1]); i++; }
    }
    return o;
}
function loadEnv(env: 'DEV' | 'PRODUCTION') {
    const f = resolve(__dirname, '..', env === 'PRODUCTION' ? '.env.PRODUCTION' : '.env.DEV');
    if (!existsSync(f)) throw new Error(`env not found ${f}`);
    loadDotenv({ path: f, override: true });
}

const PRINT_CONFIG = {
    WEIGHT_TIME: 2.0,
    WEIGHT_WEAKNESS: 1.0,
    WEIGHT_UNANSWERED: 1.5,
    FORGETTING_RATE: 5.0,
    UNANSWERED_BASE: 1000,
    TIME_SCORE_CAP: 800,
    CORRECT_PENALTY: 150,
    WEAKNESS_BONUS: 100,
    NEW_QUOTA_RATIO: 0.4,
    NEW_QUOTA_MIN: 5,
};

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (!o.name) throw new Error('--name 必須');
    loadEnv(o.env);

    const { prisma } = await import('../src/lib/prisma');
    try {
        const user = await prisma.user.findFirst({ where: { name: { contains: o.name } }, select: { id: true, loginId: true, name: true } });
        if (!user) { console.log('not found'); return; }
        console.log(`対象: ${user.loginId} ${user.name}`);
        const subj = await prisma.subject.findFirst({ where: { name: { contains: '英語' } }, select: { id: true } });
        if (!subj) return;

        const coreProblems = await prisma.coreProblem.findMany({
            where: { subjectId: subj.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, masterNumber: true, order: true, lectureVideos: true },
        });
        const cpById = new Map(coreProblems.map(c => [c.id, c]));

        // ready set (unlocked + (lectureWatched OR no videos))
        const userCore = await prisma.userCoreProblemState.findMany({
            where: { userId: user.id, coreProblemId: { in: coreProblems.map(c => c.id) } },
            select: { coreProblemId: true, isUnlocked: true, isLectureWatched: true },
        });
        const readySet = new Set<string>();
        for (const s of userCore) {
            if (s.isUnlocked) {
                const cp = cpById.get(s.coreProblemId);
                const hasVideos = Array.isArray(cp?.lectureVideos) && cp!.lectureVideos.length > 0;
                if (!hasVideos || s.isLectureWatched) readySet.add(s.coreProblemId);
            }
        }
        if (coreProblems[0]) readySet.add(coreProblems[0].id);

        // candidate problems = whose every coreProblem ∈ readySet
        const allProblems = await prisma.problem.findMany({
            where: { subjectId: subj.id },
            select: {
                id: true, customId: true, order: true,
                coreProblems: { select: { id: true } },
                userStates: { where: { userId: user.id }, select: { lastAnsweredAt: true, isCleared: true }, take: 1 },
            },
        });
        const candidates = allProblems.filter(p => p.coreProblems.length > 0 && p.coreProblems.every(c => readySet.has(c.id)));

        const now = Date.now();
        type Scored = { p: typeof allProblems[number]; score: number; isUnanswered: boolean; daysSince: number | null };
        const scored: Scored[] = candidates.map(p => {
            const st = p.userStates[0];
            if (!st || !st.lastAnsweredAt) {
                return {
                    p,
                    score: PRINT_CONFIG.UNANSWERED_BASE * PRINT_CONFIG.WEIGHT_UNANSWERED - p.order * 0.1,
                    isUnanswered: true,
                    daysSince: null,
                };
            } else {
                const days = (now - st.lastAnsweredAt.getTime()) / (1000 * 60 * 60 * 24);
                const raw = days * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME;
                let score = Math.min(raw, PRINT_CONFIG.TIME_SCORE_CAP);
                if (st.isCleared) score -= PRINT_CONFIG.CORRECT_PENALTY;
                else score += PRINT_CONFIG.WEAKNESS_BONUS * PRINT_CONFIG.WEIGHT_WEAKNESS;
                return { p, score, isUnanswered: false, daysSince: days };
            }
        });
        scored.sort((a, b) => b.score - a.score);

        console.log(`\n候補数: ${candidates.length} (うち未着手 ${scored.filter(s => s.isUnanswered).length}, 既着手 ${scored.filter(s => !s.isUnanswered).length})`);

        // ヒストグラム (score バケット)
        const buckets: Record<string, number> = {};
        const bk = (s: number) => {
            if (s < 0) return '<0';
            if (s < 50) return '0-50';
            if (s < 100) return '50-100';
            if (s < 150) return '100-150';
            if (s < 200) return '150-200';
            if (s < 300) return '200-300';
            if (s < 500) return '300-500';
            return '500+';
        };
        for (const s of scored) buckets[bk(s.score)] = (buckets[bk(s.score)] ?? 0) + 1;
        console.log('スコア帯ごとの件数:');
        for (const k of ['<0', '0-50', '50-100', '100-150', '150-200', '200-300', '300-500', '500+']) {
            console.log(`  ${k.padEnd(8)} : ${buckets[k] ?? 0}`);
        }

        // top N (B案のスロット分割を再現)
        const newQuota = Math.min(
            Math.max(PRINT_CONFIG.NEW_QUOTA_MIN, Math.floor(o.topN * PRINT_CONFIG.NEW_QUOTA_RATIO)),
            o.topN,
        );
        const unansweredRanked = scored.filter(s => s.isUnanswered);
        const answeredRanked = scored.filter(s => !s.isUnanswered);
        const newSlots = unansweredRanked.slice(0, newQuota);
        const reviewSlots = answeredRanked.slice(0, o.topN - newSlots.length);
        const overflowStart = newSlots.length;
        const overflowCount = o.topN - newSlots.length - reviewSlots.length;
        const overflow = unansweredRanked.slice(overflowStart, overflowStart + overflowCount);
        const finalRanked = [...newSlots, ...reviewSlots, ...overflow].slice(0, o.topN);

        console.log(`\n--- B案スロット分割後の印刷出題 ${o.topN} 件（newQuota=${newQuota}）---`);
        for (let i = 0; i < finalRanked.length; i++) {
            const s = finalRanked[i];
            const cps = s.p.coreProblems.map(c => cpById.get(c.id)?.masterNumber).filter(Boolean).join(',');
            console.log(`  ${String(i + 1).padStart(3)}. score=${s.score.toFixed(1).padStart(7)} order=${String(s.p.order).padStart(4)} ${s.isUnanswered ? '未着手' : `既着手(${s.daysSince!.toFixed(1)}日経過)`} cp=${cps} ${s.p.customId}`);
        }

        // CoreProblem 別の「未着手プール」と「上位N入り」
        const top30 = new Set(finalRanked.map(s => s.p.id));
        type Agg = { unanswered: number; unansweredInTop30: number; minOrder: number; maxOrder: number; avgScore: number };
        const aggByCp = new Map<string, Agg>();
        for (const s of scored) {
            if (!s.isUnanswered) continue;
            for (const c of s.p.coreProblems) {
                const cp = cpById.get(c.id);
                if (!cp) continue;
                const a = aggByCp.get(cp.id) ?? { unanswered: 0, unansweredInTop30: 0, minOrder: Infinity, maxOrder: -Infinity, avgScore: 0 };
                a.unanswered += 1;
                if (top30.has(s.p.id)) a.unansweredInTop30 += 1;
                if (s.p.order < a.minOrder) a.minOrder = s.p.order;
                if (s.p.order > a.maxOrder) a.maxOrder = s.p.order;
                a.avgScore += s.score;
                aggByCp.set(cp.id, a);
            }
        }
        console.log('\n--- 未着手プールのCoreProblem別分布 ---');
        console.log('master | 単元 | 未着手数 | TOP30入り | order範囲 | 平均score');
        for (const cp of coreProblems) {
            const a = aggByCp.get(cp.id);
            if (!a) continue;
            console.log(
                `${String(cp.masterNumber).padStart(4)} | ${cp.name.slice(0, 22).padEnd(22)} | ${String(a.unanswered).padStart(4)} | ${String(a.unansweredInTop30).padStart(3)} | ${a.minOrder}〜${a.maxOrder} | ${(a.avgScore / a.unanswered).toFixed(1)}`
            );
        }

        // #21 の未着手問題詳細
        const cp21 = coreProblems.find(c => c.masterNumber === 21);
        if (cp21) {
            console.log('\n--- #21 前置詞の未着手問題（全件 + 順位）---');
            for (const s of scored) {
                if (!s.isUnanswered) continue;
                if (!s.p.coreProblems.some(c => c.id === cp21.id)) continue;
                const rank = scored.indexOf(s) + 1;
                const cps = s.p.coreProblems.map(c => cpById.get(c.id)?.masterNumber).filter(Boolean).join(',');
                console.log(`  rank=${String(rank).padStart(4)}  score=${s.score.toFixed(1).padStart(7)}  order=${String(s.p.order).padStart(4)}  ${s.p.customId}  cp=${cps}`);
            }
        }

        // 既着手で 30日以上放置されている件数 (これらが未着手より上位に来てしまう)
        const old30 = scored.filter(s => !s.isUnanswered && s.daysSince !== null && s.daysSince >= 30).length;
        const old15 = scored.filter(s => !s.isUnanswered && s.daysSince !== null && s.daysSince >= 15).length;
        console.log(`\n参考: 既着手のうち15日以上放置=${old15} 件 (score>=150 で未着手の基本score 150 を上回る)`);
        console.log(`     30日以上放置=${old30} 件 (score>=300)`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
