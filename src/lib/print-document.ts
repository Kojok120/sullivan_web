import QRCode from 'qrcode';

import { compressProblemIds } from '@/lib/qr-utils';
import type { PrintableProblem } from '@/lib/print-types';

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
    line-height: 1.5;
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
    width: 28mm;
    min-width: 28mm;
    text-align: right;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.1;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-prefix {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    min-width: 12mm;
    padding-bottom: 1.5mm;
}

.${PRINT_DOCUMENT_ROOT_CLASS} .answer-line {
    flex: 1;
    border-bottom: 2px solid #111827;
    min-height: 9mm;
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
        const qrPayload = {
            s: input.studentLoginId,
            ...compressed,
            ...(input.unitToken ? { u: input.unitToken } : {}),
        };

        try {
            return await QRCode.toDataURL(JSON.stringify(qrPayload), {
                errorCorrectionLevel: 'M',
                width: 280,
                margin: 2,
            });
        } catch (error) {
            console.error('[print-document] QRコード生成に失敗しました', {
                error,
                studentLoginId: input.studentLoginId,
                problemIds,
            });
            return buildQrFallbackDataUrl();
        }
    }));

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
                <div class="sheet-inner">
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
            <div class="sheet-type">${input.sheetType}</div>
        </header>
    `;
}

export function getProblemDisplayId(problem: PrintableProblem): string {
    return problem.customId || problem.id;
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
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
