import crypto from 'node:crypto';

import QRCode from 'qrcode';

import type { PrintableProblem } from '@/lib/print-types';
import { compressProblemIds } from '@/lib/qr-utils';
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
    const qrCodeBySet = await Promise.all(input.problemSets.map(async (setProblems) => {
        const problemIds = setProblems.map((problem) => getProblemDisplayId(problem));
        const compressed = compressProblemIds(problemIds);
        const qrPayload = {
            s: input.studentLoginId,
            ...compressed,
            ...(input.unitToken ? { u: input.unitToken } : {}),
        };
        return await QRCode.toDataURL(JSON.stringify(qrPayload), {
            errorCorrectionLevel: 'M',
            width: 280,
            margin: 2,
        });
    }));

    const html = buildPrintHtml({
        studentName: input.studentName,
        studentLoginId: input.studentLoginId,
        subjectName: input.subjectName,
        problemSets: input.problemSets,
        qrCodeBySet,
    });

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

function buildPrintHtml(input: {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problemSets: PrintableProblem[][];
    qrCodeBySet: string[];
}): string {
    const sections = input.problemSets.map((setProblems, setIndex) => {
        const setLabel = input.problemSets.length > 1 ? ` (Set ${setIndex + 1})` : '';

        const questionRows = setProblems.map((problem) => {
            const displayId = getProblemDisplayId(problem);
            const questionText = escapeHtml(problem.question ?? '').replace(/\n/g, '<br />');
            return `
                <article class="question-row">
                    <div class="question-id">${escapeHtml(displayId)}.</div>
                    <div class="question-text">${questionText}</div>
                </article>
            `;
        }).join('');

        const answerRows = setProblems.map((problem) => {
            const displayId = getProblemDisplayId(problem);
            return `
                <div class="answer-row">
                    <div class="answer-id">${escapeHtml(displayId)}.</div>
                    <div class="answer-prefix">A.</div>
                    <div class="answer-line"></div>
                </div>
            `;
        }).join('');

        return `
            <section class="sheet ${setIndex > 0 ? 'sheet-break' : ''}">
                ${renderSheetHeader({
                    title: `${input.subjectName}${setLabel}`,
                    studentName: input.studentName,
                    studentLoginId: input.studentLoginId,
                    sheetType: '問題',
                })}
                <div class="question-list">
                    ${questionRows}
                </div>
                <div class="sheet-footer">Sullivan</div>
            </section>

            <section class="sheet answer-sheet sheet-break">
                ${renderSheetHeader({
                    title: `${input.subjectName}${setLabel}`,
                    studentName: input.studentName,
                    studentLoginId: input.studentLoginId,
                    sheetType: '解答用紙',
                })}
                <img class="qr-image" src="${input.qrCodeBySet[setIndex] || ''}" alt="QRコード" />
                <div class="answer-list">
                    ${answerRows}
                </div>
                <div class="sheet-footer">Sullivan</div>
            </section>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sullivan Print PDF</title>
    <style>
        @page {
            size: A4;
            margin: 12mm;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            color: #111827;
            background: #ffffff;
            font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
            font-size: 14px;
            line-height: 1.5;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        .sheet {
            width: 100%;
            break-inside: auto;
            page-break-inside: auto;
        }

        .sheet-break {
            break-before: page;
            page-break-before: always;
        }

        .sheet-header {
            border-bottom: 2px solid #111827;
            padding-bottom: 3mm;
            margin-bottom: 6mm;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 6mm;
        }

        .sheet-title-wrap {
            display: flex;
            align-items: flex-end;
            gap: 8mm;
            flex-wrap: wrap;
            padding-right: 32mm;
        }

        .sheet-title {
            font-size: 22px;
            font-weight: 700;
            line-height: 1.2;
        }

        .student-info {
            font-size: 18px;
            font-weight: 700;
            line-height: 1.25;
        }

        .sheet-type {
            font-size: 14px;
            color: #374151;
            font-weight: 600;
            white-space: nowrap;
            padding-bottom: 1mm;
        }

        .question-list {
            display: block;
        }

        .question-row {
            display: flex;
            align-items: flex-start;
            gap: 4mm;
            margin-bottom: 5.5mm;
            break-inside: avoid-page;
            page-break-inside: avoid;
        }

        .question-id {
            width: 26mm;
            min-width: 26mm;
            text-align: right;
            font-size: 17px;
            font-weight: 700;
            line-height: 1.45;
            padding-top: 0.5mm;
        }

        .question-text {
            flex: 1;
            border-bottom: 1px solid #d1d5db;
            font-size: 18px;
            font-weight: 500;
            line-height: 1.72;
            white-space: pre-wrap;
            padding: 0.5mm 0 4mm;
            min-height: 14mm;
        }

        .answer-sheet {
            position: relative;
            min-height: calc(297mm - 24mm);
            display: flex;
            flex-direction: column;
        }

        .qr-image {
            position: absolute;
            top: 0;
            right: 0;
            width: 26mm;
            height: 26mm;
            object-fit: contain;
        }

        .answer-list {
            margin-top: 8mm;
            flex: 1;
        }

        .answer-row {
            display: flex;
            align-items: flex-end;
            gap: 4mm;
            margin-bottom: 9mm;
            break-inside: avoid-page;
            page-break-inside: avoid;
        }

        .answer-id {
            width: 28mm;
            min-width: 28mm;
            text-align: right;
            font-size: 20px;
            font-weight: 700;
            line-height: 1.1;
        }

        .answer-prefix {
            font-size: 22px;
            font-weight: 700;
            line-height: 1;
            min-width: 12mm;
            padding-bottom: 1.5mm;
        }

        .answer-line {
            flex: 1;
            border-bottom: 2px solid #111827;
            min-height: 9mm;
        }

        .sheet-footer {
            margin-top: 10mm;
            border-top: 1px solid #d1d5db;
            padding-top: 2.5mm;
            text-align: center;
            color: #6b7280;
            font-size: 11px;
            letter-spacing: 0.2px;
        }
    </style>
</head>
<body>
    ${sections}
</body>
</html>
`;
}

function renderSheetHeader(input: {
    title: string;
    studentName: string;
    studentLoginId: string;
    sheetType: '問題' | '解答用紙';
}): string {
    return `
        <header class="sheet-header">
            <div class="sheet-title-wrap">
                <div class="sheet-title">${escapeHtml(input.title)} ${input.sheetType}</div>
                <div class="student-info">氏名: ${escapeHtml(input.studentName)} (ID: ${escapeHtml(input.studentLoginId)})</div>
            </div>
            <div class="sheet-type">${input.sheetType}</div>
        </header>
    `;
}

function getProblemDisplayId(problem: PrintableProblem): string {
    return problem.customId || problem.id;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
