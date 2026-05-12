/**
 * 英語問題の ProblemRevision.structuredContent.blocks[*].text 末尾に残る
 * 「【〇〇県/府/都/道(・改)?】」と直前改行をまとめて削除する。
 *
 * 経緯:
 *   strip-prefecture-tags.ts で Problem.question からはタグを削除したが、
 *   編集 UI（ProblemEditorClient）が ProblemRevision.structuredContent を真のソース
 *   として参照しているため、編集画面ではタグが残ったままだった。再 publish 時に
 *   deriveLegacyFieldsFromStructuredData() が走り Problem.question にタグが復活する
 *   ので、structuredContent 側も同じパターンで削除する必要がある。
 *
 * 対象:
 *   Problem.subjectId = '英語' かつ status=PUBLISHED のすべての ProblemRevision について
 *   structuredContent.blocks[*].text を走査し、末尾に都道府県タグがあれば削除。
 *   DRAFT/SENT_BACK 含む全 revision が対象（編集 UI で見える DRAFT が肝）。
 *
 * 使い方:
 *   npx tsx scripts/strip-prefecture-tags-structured.ts --env production --dry-run
 *   npx tsx scripts/strip-prefecture-tags-structured.ts --env production --yes
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvName = 'dev' | 'production';

function envFileFor(name: EnvName): string {
    return name === 'production'
        ? resolve(__dirname, '..', '.env.PRODUCTION')
        : resolve(__dirname, '..', '.env.DEV');
}

function parseArgs(argv: string[]) {
    let env: EnvName = 'dev';
    let dryRun = true;
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--env') {
            const v = argv[i + 1];
            if (v !== 'dev' && v !== 'production') throw new Error('--env');
            env = v;
            i += 1;
        } else if (a === '--dry-run') dryRun = true;
        else if (a === '--yes' || a === '-y') dryRun = false;
        else if (a?.startsWith('--')) throw new Error(`unknown ${a}`);
    }
    return { env, dryRun };
}

const STRIP_RE = /(?:\n+\s*)?【(?:[^】\/]+(?:県|府|都)(?:・改)?|北海道(?:・改)?)】\s*$/;

interface StructuredBlock {
    id: string;
    text: string;
    type: string;
}
interface StructuredContent {
    blocks: StructuredBlock[];
    summary?: string;
    version?: number;
    instructions?: string;
}

function transform(sc: unknown): { changed: boolean; next: unknown } {
    if (!sc || typeof sc !== 'object') return { changed: false, next: sc };
    const cast = sc as StructuredContent;
    if (!Array.isArray(cast.blocks)) return { changed: false, next: sc };
    let changed = false;
    const nextBlocks = cast.blocks.map((b) => {
        if (typeof b?.text !== 'string') return b;
        if (!STRIP_RE.test(b.text)) return b;
        const nextText = b.text.replace(STRIP_RE, '');
        if (nextText === b.text) return b;
        changed = true;
        return { ...b, text: nextText };
    });
    if (!changed) return { changed: false, next: sc };
    return { changed: true, next: { ...cast, blocks: nextBlocks } };
}

async function main() {
    const { env, dryRun } = parseArgs(process.argv.slice(2));
    const envFile = envFileFor(env);
    if (!existsSync(envFile)) throw new Error(`env not found: ${envFile}`);
    loadDotenv({ path: envFile, override: true });

    console.log('--- structuredContent タグ削除 ---');
    console.log(`env: ${env} (${envFile})`);
    console.log(`mode: ${dryRun ? 'dry-run' : 'apply'}`);

    const { prisma } = await import('../src/lib/prisma');
    try {
        const revs = await prisma.problemRevision.findMany({
            where: {
                problem: { subject: { name: '英語' }, status: 'PUBLISHED' },
            },
            select: {
                id: true,
                status: true,
                structuredContent: true,
                problem: { select: { customId: true } },
            },
        });

        console.log(`\n[scan] 英語公開問題の全 revision: ${revs.length}`);

        const targets: Array<{
            revisionId: string;
            customId: string;
            status: string;
            next: unknown;
            beforeSample: string;
            afterSample: string;
        }> = [];

        for (const r of revs) {
            const { changed, next } = transform(r.structuredContent);
            if (!changed) continue;
            // 末尾 80 文字をサンプル出力に使う
            const beforeText = JSON.stringify(r.structuredContent).slice(-120);
            const afterText = JSON.stringify(next).slice(-120);
            targets.push({
                revisionId: r.id,
                customId: r.problem.customId,
                status: r.status,
                next,
                beforeSample: beforeText,
                afterSample: afterText,
            });
        }

        console.log(`[scan] 削除対象 revision: ${targets.length}`);
        const byStatus: Record<string, number> = {};
        for (const t of targets) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
        console.log(`[scan] status 分布: ${JSON.stringify(byStatus)}`);

        if (targets.length > 0) {
            console.log('\n[sample] 先頭 3 件:');
            for (const t of targets.slice(0, 3)) {
                console.log(`\n  ${t.customId} rev=${t.revisionId} status=${t.status}`);
                console.log(`    before: ${t.beforeSample}`);
                console.log(`    after : ${t.afterSample}`);
            }
        }

        if (dryRun) {
            console.log('\n--dry-run のため DB 書き込みは行いません');
            return;
        }

        let ok = 0;
        let fail = 0;
        for (const t of targets) {
            try {
                await prisma.problemRevision.update({
                    where: { id: t.revisionId },
                    data: { structuredContent: t.next as never },
                });
                ok += 1;
            } catch (e) {
                fail += 1;
                console.log(`  fail ${t.customId} ${t.revisionId}: ${(e as Error).message}`);
            }
            await new Promise((r) => setTimeout(r, 20));
        }
        console.log(`\n[apply] 成功: ${ok}`);
        console.log(`[apply] 失敗: ${fail}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
