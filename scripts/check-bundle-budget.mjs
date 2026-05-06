#!/usr/bin/env node
/**
 * 主要ルートの First Load JS（gzip 後）を計測し .bundle-budget.json と突合する。
 *
 * 使い方:
 *   node scripts/check-bundle-budget.mjs              # 計測してレポート、予算超過があれば exit 1
 *   node scripts/check-bundle-budget.mjs --report     # 計測してレポートのみ（exit 0）
 *
 * 仕組み:
 * - .next/app-build-manifest.json（App Router）または .next/build-manifest.json から
 *   ルート → chunk ファイルのマッピングを取得
 * - 各 chunk を gzip 圧縮した bytes を合算してルートごとの First Load JS サイズを算出
 * - .bundle-budget.json に "routes" マップがあれば、各ルートの上限と比較
 *
 * 予算ファイルが空のとき or routes キーが無いときは reporting only として動作する。
 * これにより初回導入時は CI を壊さず、ベースラインを観測してから予算を埋められる。
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';

const REPO_ROOT = process.cwd();
const NEXT_DIR = path.join(REPO_ROOT, '.next');
const APP_MANIFEST = path.join(NEXT_DIR, 'app-build-manifest.json');
const PAGES_MANIFEST = path.join(NEXT_DIR, 'build-manifest.json');
const BUDGET_FILE = path.join(REPO_ROOT, '.bundle-budget.json');

const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report');

if (!existsSync(NEXT_DIR)) {
    console.error('[budget] .next ディレクトリが見つかりません。先に next build を実行してください。');
    process.exit(2);
}

const sizeCache = new Map();
function gzippedSize(filePath) {
    if (sizeCache.has(filePath)) return sizeCache.get(filePath);
    if (!existsSync(filePath)) return 0;
    const buf = readFileSync(filePath);
    const gz = zlib.gzipSync(buf, { level: 9 });
    sizeCache.set(filePath, gz.length);
    return gz.length;
}

function resolveChunkPath(file) {
    // manifest 内のパスは .next 相対 (e.g. "static/chunks/main-app-xxx.js")
    return path.join(NEXT_DIR, file);
}

function loadManifest() {
    if (existsSync(APP_MANIFEST)) {
        const data = JSON.parse(readFileSync(APP_MANIFEST, 'utf8'));
        const pages = data.pages ?? {};
        return { source: 'app-build-manifest.json', pages };
    }
    if (existsSync(PAGES_MANIFEST)) {
        const data = JSON.parse(readFileSync(PAGES_MANIFEST, 'utf8'));
        const pages = data.pages ?? {};
        return { source: 'build-manifest.json', pages };
    }
    return { source: null, pages: {} };
}

function loadBudget() {
    if (!existsSync(BUDGET_FILE)) {
        return { routes: {}, tolerancePct: 0 };
    }
    try {
        const data = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
        return {
            routes: data.routes ?? {},
            tolerancePct: typeof data.tolerancePct === 'number' ? data.tolerancePct : 0,
        };
    } catch (e) {
        console.error(`[budget] ${BUDGET_FILE} のパースに失敗しました: ${e.message}`);
        process.exit(2);
    }
}

function fmtBytes(n) {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

const { source, pages } = loadManifest();
const { routes: budgetRoutes, tolerancePct } = loadBudget();

if (!source) {
    console.error('[budget] manifest が見つかりません (.next/app-build-manifest.json / .next/build-manifest.json)');
    process.exit(2);
}

console.log(`[budget] manifest source: ${source}`);
console.log(`[budget] tracking ${Object.keys(pages).length} routes`);

const rows = [];
for (const [route, files] of Object.entries(pages)) {
    if (!Array.isArray(files)) continue;
    let total = 0;
    let missing = 0;
    for (const file of files) {
        const abs = resolveChunkPath(file);
        if (!existsSync(abs)) { missing++; continue; }
        const stat = statSync(abs);
        if (!stat.isFile()) { missing++; continue; }
        total += gzippedSize(abs);
    }
    rows.push({ route, total, fileCount: files.length, missing });
}

rows.sort((a, b) => b.total - a.total);

console.log('');
console.log('Route                                                     Gzip First-Load    Files');
console.log('---------------------------------------------------------------------------------');
for (const row of rows) {
    const routeStr = row.route.padEnd(56);
    const sizeStr = fmtBytes(row.total).padStart(10);
    const filesStr = `${row.fileCount}${row.missing ? ` (missing:${row.missing})` : ''}`;
    console.log(`${routeStr} ${sizeStr}        ${filesStr}`);
}
console.log('');

if (Object.keys(budgetRoutes).length === 0) {
    console.log('[budget] .bundle-budget.json に routes が設定されていません — レポートのみ実行しました');
    console.log('[budget] ベースラインを確定したら .bundle-budget.json の routes を埋めてください');
    process.exit(0);
}

const failures = [];
for (const [route, limit] of Object.entries(budgetRoutes)) {
    const row = rows.find((r) => r.route === route);
    if (!row) {
        console.warn(`[budget] WARN: budget に書かれている "${route}" が manifest に存在しません`);
        continue;
    }
    const tolerated = Math.floor(limit * (1 + (tolerancePct / 100)));
    const ok = row.total <= tolerated;
    const statusTag = ok ? 'OK  ' : 'FAIL';
    console.log(
        `[budget] ${statusTag} ${route}: ${fmtBytes(row.total)} (limit ${fmtBytes(limit)}${tolerancePct > 0 ? `, +${tolerancePct}% tol` : ''})`,
    );
    if (!ok) failures.push({ route, total: row.total, limit, tolerated });
}

if (failures.length > 0) {
    console.error('');
    console.error(`[budget] ${failures.length} route(s) exceed budget:`);
    for (const f of failures) {
        console.error(`  - ${f.route}: ${fmtBytes(f.total)} > ${fmtBytes(f.tolerated)}`);
    }
    if (reportOnly) {
        console.error('[budget] --report mode: exit 0');
        process.exit(0);
    }
    process.exit(1);
}

console.log('[budget] all monitored routes within budget');
