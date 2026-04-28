import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';

import { buildPrintDocumentMarkup } from './print-document';

describe('print-document', () => {
    it('1セット10問でも問題文を欠落させずに描画する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒A',
            studentLoginId: 'student-a',
            subjectName: '英語',
            problemSets: [[...Array.from({ length: 10 }, (_value, index) => ({
                id: `problem-${index + 1}`,
                customId: `E-${index + 1}`,
                question: `Question ${index + 1}\nLong line ${index + 1}`,
                order: index + 1,
            }))]],
        });

        expect(markup).toContain('Question 1');
        expect(markup).toContain('Question 10');
        expect(markup).toContain('Long line 10');
        expect(markup).toContain('answer-sheet');
    });

    it('複数セットでは問題と解答用紙の境界に改ページクラスを付与する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒B',
            studentLoginId: 'student-b',
            subjectName: '数学',
            problemSets: [
                [{ id: '1', customId: 'M-1', question: 'first', order: 1 }],
                [{ id: '2', customId: 'M-2', question: 'second', order: 2 }],
            ],
        });

        expect(markup).toContain('sheet answer-sheet sheet-break');
        expect(markup).toContain('sheet sheet-break');
        expect(markup).toContain('Set 2');
    });

    it('QR payload は s/c/u のみを含む', async () => {
        const qrSpy = vi.spyOn(QRCode, 'toDataURL').mockImplementationOnce(async () => 'data:image/png;base64,qr');

        await buildPrintDocumentMarkup({
            studentName: '生徒B',
            studentLoginId: 'student-b',
            subjectName: '数学',
            unitToken: '6',
            problemSets: [[
                { id: '1', customId: 'M-1', question: 'first', order: 1 },
                { id: '2', customId: 'M-2', question: 'second', order: 2 },
            ]],
        });

        expect(qrSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(String(qrSpy.mock.calls[0]?.[0]))).toEqual({
            s: 'student-b',
            c: 'M|1-2',
            u: '6',
        });

        qrSpy.mockRestore();
    });

    it('QRコード生成に失敗した場合は文脈付きのエラーを投げる', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const qrSpy = vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('boom'));

        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒C',
            studentLoginId: 'student-c',
            subjectName: '国語',
            problemSets: [[{ id: '1', customId: 'N-1', question: 'question', order: 1 }]],
        });

        expect(markup).toContain('data:image/svg+xml');
        expect(markup).toContain('QR%20unavailable');
        expect(consoleSpy).toHaveBeenCalledWith(
            '[print-document] QRコード生成に失敗しました',
            expect.objectContaining({
                studentLoginId: 'student-c',
                problemIds: ['N-1'],
            }),
        );

        consoleSpy.mockRestore();
        qrSpy.mockRestore();
    });

    it('structured problem でも別紙の解答用紙を出し、旧解答欄は本文に描画しない', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒D',
            studentLoginId: 'student-d',
            subjectName: '理科',
            problemSets: [[{
                id: 'structured-1',
                customId: 'S-101',
                question: '回路図の読み取り',
                order: 1,
                contentFormat: 'STRUCTURED_V1',
                publishedRevisionId: 'rev-1',
                structuredContent: {
                    version: 1,
                    summary: '図を見て答える',
                    blocks: [
                        { id: 'b1', type: 'paragraph', text: '図の回路は直列か並列か。' },
                        { id: 'b2', type: 'answerLines', lines: 2 },
                    ],
                },
                printConfig: {
                    template: 'WORKSPACE',
                    estimatedHeight: 'MEDIUM',
                    answerMode: 'INLINE',
                    answerLines: 3,
                    showQrOnFirstPage: true,
                },
                assets: [],
            }]],
        });

        expect(markup).toContain('problem-card');
        expect(markup).toContain('図の回路は直列か並列か。');
        expect(markup).toContain('answer-sheet');
        expect(markup).not.toContain('workspace-line');
    });

    it('graphAsset は inline SVG asset を描画し、assetId 不整合時もフォールバックする', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒E',
            studentLoginId: 'student-e',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-graph-1',
                customId: 'M-102',
                question: '二次関数のグラフ',
                order: 1,
                contentFormat: 'STRUCTURED_V1',
                publishedRevisionId: 'rev-graph-1',
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'b1', type: 'paragraph', text: 'グラフを見て答えなさい。' },
                        { id: 'b2', type: 'graphAsset', assetId: 'mismatched-asset-id' },
                    ],
                },
                assets: [{
                    id: 'actual-svg-asset',
                    kind: 'SVG',
                    fileName: 'graph.svg',
                    mimeType: 'image/svg+xml',
                    inlineContent: '<svg width="484" height="0"><path d="M0 0 L10 10" /></svg>',
                }],
            }]],
        });

        expect(markup).toContain('class="problem-figure-frame"');
        expect(markup).toContain('style="width:50%;aspect-ratio:1.3333;"');
    });

    it('legacy caption / display が残っていても印刷では標準表示だけを使う', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒G',
            studentLoginId: 'student-g',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-display-1',
                customId: 'M-202',
                question: '図版調整',
                order: 1,
                contentFormat: 'STRUCTURED_V1',
                publishedRevisionId: 'rev-display-1',
                structuredContent: {
                    version: 1,
                    blocks: [
                        {
                            id: 'img-1',
                            type: 'image',
                            assetId: 'asset-image',
                            caption: '画像',
                            display: { zoom: 1.5, panX: 0.25, panY: -0.5 },
                        },
                        {
                            id: 'legacy-caption',
                            type: 'caption',
                            text: '旧キャプション',
                        },
                        {
                            id: 'svg-1',
                            type: 'svg',
                            svg: '<svg width="320" height="240"><rect width="320" height="240" /></svg>',
                            caption: 'SVG',
                            display: { zoom: 1.8, panX: -0.5, panY: 0.2 },
                        },
                        {
                            id: 'graph-1',
                            type: 'graphAsset',
                            assetId: 'asset-graph',
                            caption: 'グラフ',
                            display: { zoom: 2, panX: -0.5, panY: 0.2 },
                        },
                        {
                            id: 'geom-1',
                            type: 'geometryAsset',
                            assetId: 'asset-geom',
                            caption: '図形',
                            display: { zoom: 2.2, panX: 0.1, panY: -0.25 },
                        },
                    ],
                } as never,
                assets: [
                    {
                        id: 'asset-image',
                        kind: 'IMAGE',
                        fileName: 'image.png',
                        mimeType: 'image/png',
                        signedUrl: 'https://example.com/image.png',
                        width: 600,
                        height: 400,
                    },
                    {
                        id: 'asset-graph',
                        kind: 'SVG',
                        fileName: 'graph.svg',
                        mimeType: 'image/svg+xml',
                        inlineContent: '<svg width="400" height="300"><circle cx="10" cy="10" r="4" /></svg>',
                    },
                    {
                        id: 'asset-geom',
                        kind: 'SVG',
                        fileName: 'geometry.svg',
                        mimeType: 'image/svg+xml',
                        inlineContent: '<svg width="500" height="500"><circle cx="10" cy="10" r="4" /></svg>',
                    },
                ],
            }]],
        });

        expect(markup).not.toContain('problem-caption');
        expect(markup).not.toContain('problem-figure-pan');
        expect(markup).not.toContain('problem-figure-zoom');
        expect(markup).toContain('class="problem-figure-content"');
        expect(markup).toContain('style="width:50%;aspect-ratio:1.3333;"');
        expect(markup).toContain('style="width:100%;aspect-ratio:1;"');
    });

    it('structured problem の本文で $...$ と $$...$$ を KaTeX 描画する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒F',
            studentLoginId: 'student-f',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-math-1',
                customId: 'M-201',
                question: '数式表示',
                order: 1,
                contentFormat: 'STRUCTURED_V1',
                publishedRevisionId: 'rev-math-1',
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'b1', type: 'paragraph', text: '解きなさい。$x^2+1$ と $$y=x+1$$ を確認する。' },
                    ],
                },
                assets: [],
            }]],
        });

        expect(markup).toContain('class="katex"');
        expect(markup).toContain('class="katex-display"');
        expect(markup).not.toContain('$x^2+1$');
    });
});
