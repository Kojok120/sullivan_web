/**
 * 指定ユーザー × 時間帯 (もしくは groupId) の LearningHistory を安全に削除するスクリプト。
 *
 * 既定は dry-run (件数と中身を出すだけ)。`--apply` を付けるとトランザクションで削除し、
 * 影響日の UserStatsDaily を `recomputeForUserDateRange` で再集計する。
 *
 * 使い方:
 *   npx tsx scripts/delete-learning-history.ts --env production \
 *     --user-name Nanami \
 *     --from "2026-05-13T22:41:00Z" --to "2026-05-13T23:11:00Z"
 *
 *   # 上記で件数と一覧を確認したあとで --apply を追加して実行:
 *   npx tsx scripts/delete-learning-history.ts --env production \
 *     --user-name Nanami \
 *     --from "2026-05-13T22:41:00Z" --to "2026-05-13T23:11:00Z" --apply
 *
 *   # groupId 指定の場合:
 *   npx tsx scripts/delete-learning-history.ts --env production --group-id <uuid> --apply
 */

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

type Args = {
    env: EnvName;
    apply: boolean;
    userName: string | null;
    userId: string | null;
    groupId: string | null;
    from: Date | null;
    to: Date | null;
};

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]): Args {
    const apply = argv.includes('--apply');
    let env: EnvName | null = null;
    let userName: string | null = null;
    let userId: string | null = null;
    let groupId: string | null = null;
    let from: Date | null = null;
    let to: Date | null = null;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = argv[i + 1];
        if (arg === '--env') {
            if (value !== 'dev' && value !== 'production') {
                throw new Error('--env は dev | production');
            }
            env = value;
            i++;
        } else if (arg === '--user-name') {
            userName = value ?? null;
            i++;
        } else if (arg === '--user-id') {
            userId = value ?? null;
            i++;
        } else if (arg === '--group-id') {
            groupId = value ?? null;
            i++;
        } else if (arg === '--from') {
            from = value ? new Date(value) : null;
            if (from && Number.isNaN(from.getTime())) throw new Error(`--from が不正: ${value}`);
            i++;
        } else if (arg === '--to') {
            to = value ? new Date(value) : null;
            if (to && Number.isNaN(to.getTime())) throw new Error(`--to が不正: ${value}`);
            i++;
        }
    }

    if (!env) throw new Error('--env を指定してください (dev | production)');
    if (!groupId && !userName && !userId) {
        throw new Error('--user-name か --user-id か --group-id のいずれかを指定してください');
    }
    if (!groupId && (!from || !to)) {
        throw new Error('--group-id 指定がない場合は --from と --to が必須');
    }

    return { env, apply, userName, userId, groupId, from, to };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(args.env);
    if (!existsSync(envFile)) throw new Error(`env file が見つかりません: ${envFile}`);
    loadDotenv({ path: envFile, override: true });
    console.log(`[delete-history] env=${args.env} (${envFile})`);

    const { prisma } = await import('../src/lib/prisma');
    const { recomputeForUserDateRange, startOfUtcDate } = await import(
        '../src/lib/user-stats-daily-service'
    );

    try {
        // 対象ユーザー解決
        let userIds: string[] = [];
        const userNameMap: Map<string, { name: string; email: string | null }> = new Map();
        if (args.userId) {
            const u = await prisma.user.findUnique({
                where: { id: args.userId },
                select: { id: true, name: true, email: true },
            });
            if (!u) throw new Error(`User not found: id=${args.userId}`);
            userIds = [u.id];
            userNameMap.set(u.id, { name: u.name ?? '(no name)', email: u.email });
        } else if (args.userName) {
            const users = await prisma.user.findMany({
                where: { name: { contains: args.userName, mode: 'insensitive' } },
                select: { id: true, name: true, email: true },
            });
            if (users.length === 0) throw new Error(`User name "${args.userName}" にマッチなし`);
            console.log(`[delete-history] name="${args.userName}" マッチ ${users.length} 件:`);
            for (const u of users) {
                console.log(`  - ${u.id} / ${u.name} / ${u.email ?? '(no email)'}`);
                userNameMap.set(u.id, { name: u.name ?? '(no name)', email: u.email });
            }
            userIds = users.map((u) => u.id);
        }

        // LearningHistory 抽出
        const where: Record<string, unknown> = {};
        if (args.groupId) {
            where.groupId = args.groupId;
            if (userIds.length > 0) where.userId = { in: userIds };
        } else {
            where.userId = { in: userIds };
            where.answeredAt = { gte: args.from, lte: args.to };
        }

        const histories = await prisma.learningHistory.findMany({
            where,
            orderBy: { answeredAt: 'asc' },
            select: {
                id: true,
                userId: true,
                problemId: true,
                problem: { select: { customId: true, problemType: true } },
                evaluation: true,
                userAnswer: true,
                groupId: true,
                answeredAt: true,
                isStudentReviewed: true,
            },
        });

        console.log('---');
        console.log(`[delete-history] 該当 ${histories.length} 件:`);
        const byUser = new Map<string, typeof histories>();
        const affectedDates = new Set<string>();
        for (const h of histories) {
            const userInfo = userNameMap.get(h.userId);
            const userLabel = userInfo
                ? `${userInfo.name}<${userInfo.email ?? '?'}>`
                : `(userId=${h.userId})`;
            const answeredAtIso = h.answeredAt.toISOString();
            const answeredAtJst = new Date(h.answeredAt.getTime() + 9 * 60 * 60 * 1000)
                .toISOString()
                .replace('T', ' ')
                .replace('Z', ' JST');
            console.log(
                `  ${answeredAtIso} (${answeredAtJst}) | ${userLabel} | eval=${h.evaluation} | problem=${h.problem.customId ?? h.problemId} (${h.problem.problemType}) | groupId=${h.groupId ?? '-'} | id=${h.id}`,
            );
            const arr = byUser.get(h.userId) ?? [];
            arr.push(h);
            byUser.set(h.userId, arr);
            const dateKey = startOfUtcDate(h.answeredAt).toISOString().slice(0, 10);
            affectedDates.add(`${h.userId}|${dateKey}`);
        }

        if (histories.length === 0) {
            console.log('[delete-history] 削除対象なし。終了。');
            return;
        }

        if (!args.apply) {
            console.log('---');
            console.log('[delete-history] dry-run。削除はしない。--apply で実行。');
            return;
        }

        // 削除 + stats 再集計
        console.log('---');
        console.log('[delete-history] --apply 指定。削除を開始する。');
        const ids = histories.map((h) => h.id);
        const result = await prisma.$transaction(async (tx) => {
            return tx.learningHistory.deleteMany({ where: { id: { in: ids } } });
        });
        console.log(`[delete-history] 削除完了: ${result.count} 件`);

        // 影響日の UserStatsDaily を recompute
        for (const key of affectedDates) {
            const [userId, dateKey] = key.split('|');
            if (!userId || !dateKey) continue;
            const from = new Date(`${dateKey}T00:00:00Z`);
            const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
            const updated = await recomputeForUserDateRange(userId, from, to);
            console.log(
                `[delete-history] recompute UserStatsDaily user=${userId} date=${dateKey} updatedRows=${updated}`,
            );
        }

        console.log('[delete-history] 全処理完了');
    } finally {
        const { prisma } = await import('../src/lib/prisma');
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('[delete-history] 失敗:', err);
    process.exitCode = 1;
});
