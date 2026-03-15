import crypto from 'node:crypto';

import {
    buildPrintDocumentMarkup,
    buildStandalonePrintDocumentHtml,
    getProblemDisplayId,
} from '@/lib/print-document';
import type { PrintableProblem } from '@/lib/print-types';
import { getPdfBrowser } from '@/lib/print-pdf/browser';

const PDF_CACHE_TTL_MS = 5 * 60 * 1000;
const RENDER_TIMEOUT_MS = 45_000;
const FONT_READY_TIMEOUT_MS = 1_500;
const MAX_CACHE_ENTRIES = 20;
const MAX_CACHE_BYTES = 80 * 1024 * 1024;

export type PrintPdfInput = {
    cacheKey: string;
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problemSets: PrintableProblem[][];
    unitToken?: string;
};

type PdfCacheEntry = {
    buffer: Buffer;
    etag: string;
    expiresAt: number;
    pageCount: number;
};

export type PrintPdfResult = {
    buffer: Buffer;
    etag: string;
    cacheStatus: 'cache-hit' | 'inflight-hit' | 'rendered';
    renderMs: number;
    pageCount: number;
};

const pdfCache = new Map<string, PdfCacheEntry>();
const inflightRenders = new Map<string, Promise<PdfCacheEntry>>();
let currentCacheBytes = 0;

export function buildProblemIdsHash(problemSets: PrintableProblem[][]): string {
    const flatIds = problemSets.flat().map((problem) => getProblemDisplayId(problem));
    return crypto.createHash('sha1').update(flatIds.join(',')).digest('hex');
}

export function buildPrintPdfCacheKey(params: {
    targetUserId: string;
    subjectId: string;
    coreProblemId?: string;
    sets: number;
    problemIdsHash: string;
}): string {
    return [
        params.targetUserId,
        params.subjectId,
        params.coreProblemId ?? 'all',
        String(params.sets),
        params.problemIdsHash,
    ].join(':');
}

export async function getOrCreatePrintPdf(input: PrintPdfInput): Promise<PrintPdfResult> {
    cleanupExpiredCache();

    const now = Date.now();
    const cached = pdfCache.get(input.cacheKey);
    if (cached && cached.expiresAt > now) {
        // ヒット時に末尾へ移動し、簡易LRUとして扱う。
        pdfCache.delete(input.cacheKey);
        pdfCache.set(input.cacheKey, cached);
        return {
            buffer: cached.buffer,
            etag: cached.etag,
            cacheStatus: 'cache-hit',
            renderMs: 0,
            pageCount: cached.pageCount,
        };
    }

    const running = inflightRenders.get(input.cacheKey);
    if (running) {
        const shared = await running;
        return {
            buffer: shared.buffer,
            etag: shared.etag,
            cacheStatus: 'inflight-hit',
            renderMs: 0,
            pageCount: shared.pageCount,
        };
    }

    const startedAt = Date.now();
    const renderPromise = renderPdfEntry(input)
        .then((entry) => {
            setCacheEntry(input.cacheKey, entry);
            return entry;
        })
        .finally(() => {
            inflightRenders.delete(input.cacheKey);
        });

    inflightRenders.set(input.cacheKey, renderPromise);

    const rendered = await renderPromise;
    return {
        buffer: rendered.buffer,
        etag: rendered.etag,
        cacheStatus: 'rendered',
        renderMs: Date.now() - startedAt,
        pageCount: rendered.pageCount,
    };
}

async function renderPdfEntry(input: PrintPdfInput): Promise<PdfCacheEntry> {
    const { markup, cssText } = await buildPrintDocumentMarkup({
        studentName: input.studentName,
        studentLoginId: input.studentLoginId,
        subjectName: input.subjectName,
        problemSets: input.problemSets,
        unitToken: input.unitToken,
    });
    const html = buildStandalonePrintDocumentHtml({ markup, cssText });

    const browser = await getPdfBrowser();
    const page = await browser.newPage();

    try {
        page.setDefaultTimeout(RENDER_TIMEOUT_MS);
        await withTimeout(
            page.setContent(html, {
                waitUntil: 'domcontentloaded',
                timeout: RENDER_TIMEOUT_MS,
            }),
            RENDER_TIMEOUT_MS,
            'PDF HTMLの読み込みがタイムアウトしました',
        );

        await withTimeout(
            page.emulateMediaType('print'),
            RENDER_TIMEOUT_MS,
            '印刷メディア設定がタイムアウトしました',
        );

        await withTimeout(
            page.evaluate(async () => {
                await document.fonts.ready;
            }),
            FONT_READY_TIMEOUT_MS,
            'フォント読み込みがタイムアウトしました',
        ).catch(() => {
            // フォント待機が長引く場合でも、PDF生成は継続する。
        });

        const pdfBuffer = await withTimeout(
            page.pdf({
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                timeout: RENDER_TIMEOUT_MS,
            }),
            RENDER_TIMEOUT_MS,
            'PDF生成がタイムアウトしました',
        );

        const buffer = Buffer.from(pdfBuffer);
        const etag = `"${crypto.createHash('sha1').update(buffer).digest('hex')}"`;
        const pageCount = estimatePdfPageCount(buffer);

        return {
            buffer,
            etag,
            expiresAt: Date.now() + PDF_CACHE_TTL_MS,
            pageCount,
        };
    } finally {
        await page.close().catch(() => {
            // 既に閉じられている場合は無視する。
        });
    }
}

function estimatePdfPageCount(buffer: Buffer): number {
    const raw = buffer.toString('latin1');
    const matches = raw.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of pdfCache.entries()) {
        if (value.expiresAt <= now) {
            deleteCacheEntry(key, value);
        }
    }
}

function setCacheEntry(key: string, entry: PdfCacheEntry) {
    const existing = pdfCache.get(key);
    if (existing) {
        currentCacheBytes -= existing.buffer.length;
        pdfCache.delete(key);
    }

    pdfCache.set(key, entry);
    currentCacheBytes += entry.buffer.length;

    pruneCacheByLimits();
}

function pruneCacheByLimits() {
    while (
        pdfCache.size > MAX_CACHE_ENTRIES ||
        currentCacheBytes > MAX_CACHE_BYTES
    ) {
        const oldest = pdfCache.entries().next().value as [string, PdfCacheEntry] | undefined;
        if (!oldest) break;
        deleteCacheEntry(oldest[0], oldest[1]);
    }
}

function deleteCacheEntry(key: string, entry: PdfCacheEntry) {
    if (pdfCache.delete(key)) {
        currentCacheBytes = Math.max(0, currentCacheBytes - entry.buffer.length);
    }
}
