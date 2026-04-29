/**
 * grading-service が実際に使うのと同じ指標で各 CoreProblem の unlock 判定状況を可視化する。
 *
 * 仕様 (src/lib/grading-service.ts:1636-1656):
 *   - validProblems = cp.problems.filter(全 coreProblems が unlockedCpIds に含まれる)
 *   - answeredCount = validProblems で unlockLastAnsweredAt !== null の数
 *   - correctCount  = validProblems で unlockIsCleared の数
 *   - isPassed = AR>=0.4 && CR>=0.5
 *
 * unitMode (単元別印刷) で解いた回答は unlock* 系を更新しないので、
 *   lastAnsweredAt があるのに unlockLastAnsweredAt が null
 *   isCleared なのに unlockIsCleared が false
 * の問題が unlock 判定の数として落ちる。これを差分として一緒に表示する。
 *
 * 使い方:
 *   tsx scripts/inspect-unlock-judgement.ts --name ペスタロッチ --env PRODUCTION
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface CliOptions { name: string; env: 'DEV' | 'PRODUCTION'; }

function parseArgs(argv: string[]): CliOptions {
    const o: CliOptions = { name: '', env: 'DEV' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if ((a === '--name' || a === '-n') && argv[i + 1]) { o.name = argv[i + 1]; i++; }
        else if (a === '--env' && argv[i + 1]) {
            const v = argv[i + 1].toUpperCase();
            if (v === 'PRODUCTION' || v === 'DEV') o.env = v;
            i++;
        }
    }
    return o;
}

function loadEnv(env: 'DEV' | 'PRODUCTION') {
    const f = resolve(__dirname, '..', env === 'PRODUCTION' ? '.env.PRODUCTION' : '.env.DEV');
    if (!existsSync(f)) throw new Error(`env file not found: ${f}`);
    loadDotenv({ path: f, override: true });
}

const UNLOCK_ANSWER_RATE = 0.4;
const UNLOCK_CORRECT_RATE = 0.5;

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (!o.name) throw new Error('--name 必須');
    loadEnv(o.env);

    const { prisma } = await import('../src/lib/prisma');
    try {
        const user = await prisma.user.findFirst({
            where: { name: { contains: o.name } },
            select: { id: true, loginId: true, name: true },
        });
        if (!user) { console.log('not found'); return; }
        console.log(`対象: ${user.loginId} ${user.name}`);

        const subj = await prisma.subject.findFirst({ where: { name: { contains: '英語' } }, select: { id: true } });
        if (!subj) return;

        const coreProblems = await prisma.coreProblem.findMany({
            where: { subjectId: subj.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, masterNumber: true, order: true },
        });
        const cpById = new Map(coreProblems.map(c => [c.id, c]));

        // unlockedCpIds (grading-service と同じく isUnlocked のみ。先頭は強制)
        const states = await prisma.userCoreProblemState.findMany({
            where: { userId: user.id, coreProblemId: { in: coreProblems.map(c => c.id) }, isUnlocked: true },
            select: { coreProblemId: true },
        });
        const unlockedCpIds = new Set(states.map(s => s.coreProblemId));
        if (coreProblems[0]) unlockedCpIds.add(coreProblems[0].id);

        // 全英語問題 + 各問題のCoreProblemタグ + ユーザーstate
        const problems = await prisma.problem.findMany({
            where: { subjectId: subj.id },
            select: {
                id: true,
                customId: true,
                coreProblems: { select: { id: true } },
                userStates: {
                    where: { userId: user.id },
                    select: {
                        lastAnsweredAt: true, isCleared: true,
                        unlockLastAnsweredAt: true, unlockIsCleared: true,
                    },
                    take: 1,
                },
            },
        });

        const probById = new Map(problems.map(p => [p.id, p]));

        // CoreProblemId -> problems[]
        const cpProblems = new Map<string, typeof problems>();
        for (const cp of coreProblems) cpProblems.set(cp.id, []);
        for (const p of problems) {
            for (const cp of p.coreProblems) {
                const arr = cpProblems.get(cp.id);
                if (arr) arr.push(p);
            }
        }

        console.log('\nunlocked CP数:', unlockedCpIds.size);
        console.log('master | 単元 | 全 | valid | unlockAns | unlockClr | AR% | CR% | judge | (素ans/素clr) 単元印刷で漏れた件数');

        for (const cp of coreProblems) {
            if (!unlockedCpIds.has(cp.id)) continue;
            const all = cpProblems.get(cp.id) ?? [];
            const valid = all.filter(p => p.coreProblems.every(c => unlockedCpIds.has(c.id)));
            const validIds = new Set(valid.map(p => p.id));
            const validStates = valid.map(p => p.userStates[0]).filter(Boolean) as NonNullable<typeof problems[number]['userStates'][number]>[];
            const unlockAns = validStates.filter(s => s.unlockLastAnsweredAt !== null).length;
            const unlockClr = validStates.filter(s => s.unlockIsCleared).length;
            const rawAns = validStates.filter(s => s.lastAnsweredAt !== null).length;
            const rawClr = validStates.filter(s => s.isCleared).length;
            const total = valid.length;
            const ar = total === 0 ? 0 : unlockAns / total;
            const cr = unlockAns === 0 ? 0 : unlockClr / unlockAns;
            const passed = ar >= UNLOCK_ANSWER_RATE && cr >= UNLOCK_CORRECT_RATE;
            const lostAns = rawAns - unlockAns;
            const lostClr = rawClr - unlockClr;
            // 「pass判定に必要な追加回答数」(現状AR<40%なら)
            const need = total > 0 && ar < UNLOCK_ANSWER_RATE ? Math.ceil(UNLOCK_ANSWER_RATE * total) - unlockAns : 0;
            console.log(
                `${String(cp.masterNumber).padStart(4)} | ${cp.name.slice(0, 20).padEnd(20)} | ${String(all.length).padStart(3)} | ${String(total).padStart(4)} | ${String(unlockAns).padStart(6)} | ${String(unlockClr).padStart(6)} | ${(ar * 100).toFixed(0).padStart(4)} | ${(cr * 100).toFixed(0).padStart(4)} | ${passed ? 'PASS' : '----'} | (素${rawAns}/${rawClr})  漏れ:ans=${lostAns} clr=${lostClr} ${need > 0 ? `必要回答+${need}` : ''}`
            );
        }

        // 単元印刷で「unlock判定にカウントされなかった」回答の件数
        let totalLostAns = 0; let totalLostClr = 0;
        for (const p of problems) {
            const s = p.userStates[0];
            if (!s) continue;
            if (s.lastAnsweredAt && !s.unlockLastAnsweredAt) totalLostAns++;
            if (s.isCleared && !s.unlockIsCleared) totalLostClr++;
        }
        console.log(`\n[isUnitMode等で unlock 判定に反映されなかった件数] answered:${totalLostAns}  cleared:${totalLostClr}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
