import katex from 'katex';
import QRCode from 'qrcode';

import { compressProblemIds } from '@/lib/qr-utils';
import { renderProblemTextHtml } from '@/lib/problem-text';
import { ensureRenderableSvgMarkup, getRenderableSvgDimensions, normalizeSvgExport } from '@/lib/problem-svg';
import { parseStructuredDocument } from '@/lib/structured-problem';
import type { PrintableProblem, PrintableProblemAsset } from '@/lib/print-types';

export type PrintDocumentInput = {
    studentName: string;
    studentLoginId: string;
    subjectName: string;
    problemSets: PrintableProblem[][];
    unitToken?: string;
};

export const PRINT_DOCUMENT_ROOT_CLASS = 'sullivan-print-document';

export const PRINT_DOCUMENT_CSS = `
@page {
    size: A4;
    margin: 12mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} {
    color: #111827;
    background: #ffffff;
    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    font-size: 14px;
    line-height: 1.55;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
}

.${PRINT_DOCUMENT_ROOT_CLASS},
.${PRINT_DOCUMENT_ROOT_CLASS} * {
    box-sizing: border-box;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet {
    width: 100%;
    break-inside: auto;
    page-break-inside: auto;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-break {
    break-before: page;
    page-break-before: always;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-inner {
    position: relative;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-header {
    border-bottom: 2px solid #111827;
    padding-bottom: 3mm;
    margin-bottom: 6mm;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-title-wrap {
    display: flex;
    align-items: flex-end;
    gap: 8mm;
    flex-wrap: wrap;
    padding-right: 32mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-title {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .student-info {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-type {
    font-size: 14px;
    color: #374151;
    font-weight: 600;
    white-space: nowrap;
    padding-bottom: 1mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .question-list {
    display: block;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .question-row {
    display: flex;
    align-items: flex-start;
    gap: 4mm;
    margin-bottom: 5.5mm;
    break-inside: avoid-page;
    page-break-inside: avoid;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .question-id {
    width: 26mm;
    min-width: 26mm;
    text-align: right;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.45;
    padding-top: 0.5mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .question-text {
    flex: 1;
    border-bottom: 1px solid #d1d5db;
    font-size: 18px;
    font-weight: 500;
    line-height: 1.72;
    white-space: pre-wrap;
    padding: 0.5mm 0 4mm;
    min-height: 14mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .structured-question-list {
    display: flex;
    flex-direction: column;
    gap: 7mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-card {
    border: 1px solid #d1d5db;
    border-radius: 5mm;
    padding: 5mm;
    break-inside: avoid-page;
    page-break-inside: avoid;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .structured-question-list .problem-card:first-child .problem-card-header {
    padding-right: 30mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .structured-question-list .problem-card:first-child .problem-body > :first-child {
    padding-right: 30mm;
    min-height: 22mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-card-header {
    display: flex;
    align-items: baseline;
    gap: 4mm;
    margin-bottom: 4mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-card-header .question-id {
    width: auto;
    min-width: 0;
    text-align: left;
    padding-top: 0;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-card-summary,
.${PRINT_DOCUMENT_ROOT_CLASS} .problem-paragraph {
    white-space: pre-wrap;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-body {
    display: flex;
    flex-direction: column;
    gap: 3mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-choices {
    list-style: upper-alpha;
    padding-left: 7mm;
    margin: 0;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-table th,
.${PRINT_DOCUMENT_ROOT_CLASS} .problem-table td {
    border: 1px solid #9ca3af;
    padding: 2mm;
    vertical-align: top;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure {
    margin: 2mm 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure-frame {
    position: relative;
    overflow: hidden;
    max-width: 100%;
    max-height: 120mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure-image,
.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure-svg svg {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 120mm;
    object-fit: contain;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-figure-svg {
    width: 100%;
    height: 100%;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-blank-group {
    display: grid;
    gap: 2mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-blank-row {
    display: flex;
    align-items: center;
    gap: 3mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .problem-blank-line {
    flex: 1;
    min-height: 8mm;
    border-bottom: 1px solid #111827;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .katex-display {
    overflow-wrap: anywhere;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .workspace {
    margin-top: 4mm;
    display: flex;
    flex-direction: column;
    gap: 2.5mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .workspace-line {
    border-bottom: 1px solid #374151;
    min-height: 8mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .graph-paper {
    width: 100%;
    min-height: 85mm;
    border: 1px solid #9ca3af;
    background-image:
        linear-gradient(to right, rgba(156,163,175,0.35) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(156,163,175,0.35) 1px, transparent 1px),
        linear-gradient(to right, rgba(17,24,39,0.18) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(17,24,39,0.18) 1px, transparent 1px);
    background-size: 5mm 5mm, 5mm 5mm, 25mm 25mm, 25mm 25mm;
    background-position: 0 0, 0 0, 0 0, 0 0;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-sheet .sheet-inner {
    min-height: calc(297mm - 24mm);
    display: flex;
    flex-direction: column;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .qr-image {
    position: absolute;
    top: 0;
    right: 0;
    width: 26mm;
    height: 26mm;
    object-fit: contain;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .qr-image-inline {
    top: 2mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-list {
    margin-top: 8mm;
    flex: 1;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-row {
    display: flex;
    align-items: flex-end;
    gap: 4mm;
    margin-bottom: 9mm;
    break-inside: avoid-page;
    page-break-inside: avoid;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-id {
    flex: 0 0 auto;
    text-align: left;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
    padding-bottom: 1mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-line {
    flex: 1;
    border-bottom: 2px solid #111827;
    min-height: 9mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-template {
    flex: 1;
    min-height: 9mm;
    padding: 1mm 0;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-template svg.numberline {
    max-width: 100%;
    height: auto;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .sheet-footer {
    margin-top: 10mm;
    border-top: 1px solid #d1d5db;
    padding-top: 2.5mm;
    text-align: center;
    color: #6b7280;
    font-size: 11px;
    letter-spacing: 0.2px;
}

@media screen {
    .${PRINT_DOCUMENT_ROOT_CLASS} {
        padding: 16px 0;
    }

    .${PRINT_DOCUMENT_ROOT_CLASS} .sheet {
        max-width: 210mm;
        margin: 0 auto 16px;
        background: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
    }

    .${PRINT_DOCUMENT_ROOT_CLASS} .sheet-inner {
        padding: 12mm;
    }
}

@media print {
    .${PRINT_DOCUMENT_ROOT_CLASS} {
        padding: 0;
    }

    .${PRINT_DOCUMENT_ROOT_CLASS} .sheet {
        max-width: none;
        margin: 0;
        background: #ffffff;
        box-shadow: none;
    }

    .${PRINT_DOCUMENT_ROOT_CLASS} .sheet-inner {
        padding: 0;
    }
}
`;

export async function buildPrintDocumentMarkup(input: PrintDocumentInput): Promise<{
    markup: string;
    cssText: string;
}> {
    const qrCodeBySet = await Promise.all(input.problemSets.map(async (setProblems) => {
        const problemIds = setProblems.map((problem) => getProblemDisplayId(problem));
        const compressed = compressProblemIds(problemIds);

        try {
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
        } catch (error) {
            console.error('[print-document] QRコード生成に失敗しました', {
                error,
                studentLoginId: input.studentLoginId,
                problemIds: setProblems.map((problem) => problem.customId),
            });
            return buildQrFallbackDataUrl();
        }
    }));

    const sections = input.problemSets.map((setProblems, setIndex) => {
        const setLabel = input.problemSets.length > 1 ? ` (Set ${setIndex + 1})` : '';
        const hasStructured = setProblems.some(isStructuredPrintableProblem);

        const questionRows = setProblems.map((problem) => (
            isStructuredPrintableProblem(problem)
                ? renderStructuredProblem(problem)
                : renderPlainProblem(problem)
        )).join('');

        const answerRows = setProblems.map((problem) => {
            const displayId = getProblemDisplayId(problem);
            const template = problem.answerSpec?.answerTemplate?.trim();
            const answerBody = template
                ? `<div class="answer-template">${renderProblemTextHtml(template)}</div>`
                : `<div class="answer-line"></div>`;

            return `
                <div class="answer-row">
                    <div class="answer-id">${escapeHtml(displayId)}.</div>
                    ${answerBody}
                </div>
            `;
        }).join('');

        return `
            <section class="sheet ${setIndex > 0 ? 'sheet-break' : ''}">
                <div class="sheet-inner">
                    ${renderSheetHeader({
                        title: `${input.subjectName}${setLabel}`,
                        studentName: input.studentName,
                        studentLoginId: input.studentLoginId,
                        sheetType: '問題',
                    })}
                    ${hasStructured ? `<img class="qr-image qr-image-inline" src="${qrCodeBySet[setIndex] || ''}" alt="QRコード" />` : ''}
                    <div class="${hasStructured ? 'structured-question-list' : 'question-list'}">
                        ${questionRows}
                    </div>
                    <div class="sheet-footer">Sullivan</div>
                </div>
            </section>
            <section class="sheet answer-sheet sheet-break">
                <div class="sheet-inner">
                    ${renderSheetHeader({
                        title: `${input.subjectName}${setLabel}`,
                        studentName: input.studentName,
                        studentLoginId: input.studentLoginId,
                        sheetType: '解答用紙',
                    })}
                    <img class="qr-image" src="${qrCodeBySet[setIndex] || ''}" alt="QRコード" />
                    <div class="answer-list">
                        ${answerRows}
                    </div>
                    <div class="sheet-footer">Sullivan</div>
                </div>
            </section>
        `;
    }).join('');

    return {
        markup: `<div class="${PRINT_DOCUMENT_ROOT_CLASS}">${sections}</div>`,
        cssText: PRINT_DOCUMENT_CSS,
    };
}

export function buildStandalonePrintDocumentHtml(input: {
    markup: string;
    cssText?: string;
}): string {
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sullivan Print PDF</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" />
    <style>
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
        }

        ${input.cssText ?? PRINT_DOCUMENT_CSS}
    </style>
</head>
<body>
    ${input.markup}
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
        </header>
    `;
}

function renderStructuredProblem(problem: PrintableProblem): string {
    const displayId = getProblemDisplayId(problem);
    const document = parseStructuredDocumentSafely(problem);

    if (!document) {
        return renderPlainProblem(problem);
    }

    const summary = document.summary?.trim();
    const blocksMarkup = document.blocks.map((block) => renderStructuredBlock(problem, block)).join('');

    return `
        <article class="problem-card">
            <div class="problem-card-header">
                <div class="question-id">${escapeHtml(displayId)}.</div>
            </div>
            ${summary ? `<div class="problem-card-summary">${escapeHtml(summary)}</div>` : ''}
            <div class="problem-body">
                ${blocksMarkup}
            </div>
        </article>
    `;
}

function renderStructuredBlock(problem: PrintableProblem, block: NonNullable<PrintableProblem['structuredContent']>['blocks'][number]): string {
    switch (block.type) {
        case 'paragraph':
            return `<div class="problem-paragraph">${renderProblemTextHtml(block.text)}</div>`;
        case 'katexInline':
            return `<div>${renderKatex(block.latex, false)}</div>`;
        case 'katexDisplay':
            return `<div class="katex-display">${renderKatex(block.latex, true)}</div>`;
        case 'choices':
            return `<ol class="problem-choices">${block.options.map((option) => `<li>${escapeHtml(option.label)}</li>`).join('')}</ol>`;
        case 'table':
            return `
                <div>
                    <table class="problem-table">
                        ${block.headers.length > 0 ? `<thead><tr>${block.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>` : ''}
                        <tbody>
                            ${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        case 'blankGroup':
            return `
                <div class="problem-blank-group">
                    ${block.blanks.map((blank) => `
                        <div class="problem-blank-row">
                            <div>${escapeHtml(blank.label)}</div>
                            <div class="problem-blank-line"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        case 'image':
            return renderAssetFigure(problem, block.assetId, block.src, block.alt, 1);
        case 'svg':
            return renderSvgFigure(problem, block.assetId, block.svg, 1);
        case 'graphAsset':
            return renderFigureAsset(problem, block.assetId, 0.5);
        case 'geometryAsset':
            return renderFigureAsset(problem, block.assetId, 1);
        case 'answerLines':
            return '';
        default:
            return '';
    }
}

function renderPlainProblem(problem: PrintableProblem): string {
    const displayId = getProblemDisplayId(problem);
    const questionText = escapeHtml(problem.question ?? '').replace(/\n/g, '<br />');

    return `
        <article class="question-row">
            <div class="question-id">${escapeHtml(displayId)}.</div>
            <div class="question-text">${questionText}</div>
        </article>
    `;
}

function renderAssetFigure(
    problem: PrintableProblem,
    assetId?: string,
    src?: string,
    alt?: string,
    displayScale = 1,
): string {
    const asset = assetId ? findProblemAsset(problem.assets, assetId) : undefined;
    const resolvedSrc = src || asset?.signedUrl;
    if (!resolvedSrc) return '';

    return renderFigureViewport(
        `<img class="problem-figure-image" src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt || '図版')}" />`,
        {
            aspectRatio: resolveProblemFigureAspectRatio(asset),
            displayScale,
        },
    );
}

function renderFigureAsset(
    problem: PrintableProblem,
    assetId?: string,
    displayScale = 1,
): string {
    const asset = findFigureAsset(problem.assets, assetId);
    if (!asset) return '';

    if (isSvgAsset(asset)) {
        return renderSvgFigure(problem, asset.id, asset.inlineContent ?? undefined, displayScale);
    }

    return renderAssetFigure(problem, asset.id, asset.signedUrl ?? undefined, '図版', displayScale);
}

function renderSvgFigure(
    problem: PrintableProblem,
    assetId?: string,
    inlineSvg?: string,
    displayScale = 1,
): string {
    const asset = assetId ? findFigureAsset(problem.assets, assetId) : undefined;
    const svg = ensureRenderableSvgMarkup(inlineSvg || asset?.inlineContent || '');

    if (svg) {
        return renderFigureViewport(
            `<div class="problem-figure-svg">${svg}</div>`,
            {
                aspectRatio: resolveProblemFigureAspectRatio({
                    kind: asset?.kind,
                    mimeType: asset?.mimeType,
                    inlineContent: svg,
                    width: asset?.width,
                    height: asset?.height,
                }),
                displayScale,
            },
        );
    }

    if (asset?.signedUrl) {
        return renderAssetFigure(problem, assetId, asset.signedUrl, '図版', displayScale);
    }

    return '';
}

function renderFigureViewport(
    contentHtml: string,
    input: {
        aspectRatio: number;
        displayScale: number;
    },
) {
    const formatStyleNumber = (value: number) => Number(value.toFixed(4)).toString();

    return `
        <figure class="problem-figure">
            <div
                class="problem-figure-frame"
                style="width:${formatStyleNumber(input.displayScale * 100)}%;aspect-ratio:${formatStyleNumber(input.aspectRatio)};"
            >
                <div class="problem-figure-content">
                    ${contentHtml}
                </div>
            </div>
        </figure>
    `;
}

function parseStructuredDocumentSafely(problem: PrintableProblem) {
    if (!problem.structuredContent) {
        return null;
    }

    try {
        return parseStructuredDocument(problem.structuredContent);
    } catch (error) {
        console.error('[print-document] structuredContent の解析に失敗しました', {
            problemId: problem.id,
            error,
        });
        return null;
    }
}

function resolveProblemFigureAspectRatio(
    asset?: {
        kind?: string | null;
        mimeType?: string | null;
        inlineContent?: string | null;
        width?: number | null;
        height?: number | null;
    } | null,
    fallbackAspectRatio = 4 / 3,
) {
    if (asset?.width && asset.width > 0 && asset.height && asset.height > 0) {
        return asset.width / asset.height;
    }

    const inlineContent = asset?.inlineContent?.trim();
    const normalizedSvg = normalizeSvgExport(inlineContent ?? '');
    const isSvg = asset?.kind === 'SVG'
        || asset?.mimeType === 'image/svg+xml'
        || normalizedSvg.startsWith('<svg');

    if (isSvg && inlineContent) {
        const dimensions = getRenderableSvgDimensions(inlineContent);
        if (dimensions) {
            return dimensions.width / dimensions.height;
        }
    }

    return fallbackAspectRatio;
}

function findProblemAsset(assets: PrintableProblemAsset[] | undefined, assetId: string) {
    return assets?.find((asset) => asset.id === assetId);
}

function findFigureAsset(assets: PrintableProblemAsset[] | undefined, assetId?: string) {
    if (!assets || assets.length === 0) {
        return undefined;
    }

    if (assetId) {
        const exact = assets.find((asset) => asset.id === assetId);
        if (exact && (isSvgAsset(exact) || exact.kind === 'IMAGE' || exact.mimeType.startsWith('image/') || Boolean(exact.signedUrl))) {
            return exact;
        }
    }

    return assets.find((asset) => isSvgAsset(asset))
        ?? assets.find((asset) => asset.kind === 'IMAGE' || asset.mimeType.startsWith('image/') || Boolean(asset.signedUrl));
}

function isSvgAsset(asset: PrintableProblemAsset) {
    return asset.kind === 'SVG'
        || asset.mimeType === 'image/svg+xml'
        || normalizeSvgExport(asset.inlineContent ?? '').startsWith('<svg');
}

function renderKatex(latex: string, displayMode: boolean): string {
    try {
        return katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            output: 'htmlAndMathml',
        });
    } catch {
        return `<code>${escapeHtml(latex)}</code>`;
    }
}

function isStructuredPrintableProblem(problem: PrintableProblem): boolean {
    return problem.contentFormat === 'STRUCTURED_V1' && Boolean(problem.structuredContent);
}

export function getProblemDisplayId(problem: PrintableProblem): string {
    return problem.customId;
}

function buildQrFallbackDataUrl(): string {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">
    <rect width="280" height="280" rx="18" fill="#ffffff" stroke="#111827" stroke-width="8" />
    <text x="50%" y="46%" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#111827">
        QR unavailable
    </text>
    <text x="50%" y="62%" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#4b5563">
        Please regenerate
    </text>
</svg>
`.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
