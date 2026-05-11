import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';

import { buildPrintDocumentMarkup } from './print-document';
import type { PrintableProblem } from './print-types';

describe('print-document', () => {
    it('1セット10問でも問題文を欠落させずに描画する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒A',
            studentLoginId: 'student-a',
            subjectName: '英語',
            problemSets: [[...Array.from({ length: 10 }, (_value, index): PrintableProblem => ({
                id: `problem-${index + 1}`,
                customId: `E-${index + 1}`,
                order: index + 1,
                publishedRevisionId: `rev-${index + 1}`,
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: `p-${index + 1}`, type: 'paragraph', text: `Question ${index + 1}\nLong line ${index + 1}` },
                    ],
                },
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
                [{
                    id: '1', customId: 'M-1', order: 1,
                    publishedRevisionId: 'rev-1',
                    structuredContent: { version: 1, blocks: [{ id: 'p1', type: 'paragraph', text: 'first' }] },
                } as PrintableProblem],
                [{
                    id: '2', customId: 'M-2', order: 2,
                    publishedRevisionId: 'rev-2',
                    structuredContent: { version: 1, blocks: [{ id: 'p2', type: 'paragraph', text: 'second' }] },
                } as PrintableProblem],
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
                {
                    id: '1', customId: 'M-1', order: 1,
                    publishedRevisionId: 'rev-1',
                    structuredContent: { version: 1, blocks: [{ id: 'p1', type: 'paragraph', text: 'first' }] },
                } as PrintableProblem,
                {
                    id: '2', customId: 'M-2', order: 2,
                    publishedRevisionId: 'rev-2',
                    structuredContent: { version: 1, blocks: [{ id: 'p2', type: 'paragraph', text: 'second' }] },
                } as PrintableProblem,
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
            problemSets: [[{
                id: '1', customId: 'N-1', order: 1,
                publishedRevisionId: 'rev-1',
                structuredContent: { version: 1, blocks: [{ id: 'p1', type: 'paragraph', text: 'question' }] },
            } as PrintableProblem]],
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

    it('structuredContent が欠落している問題はエラープレースホルダを描画する', async () => {
        // Phase A 以降 PROD には structuredContent 欠落問題は存在しないが、解析失敗時の保険として
        // 問題本文の代わりにプレースホルダを描画することを担保する。
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒X',
            studentLoginId: 'student-x',
            subjectName: '英語',
            problemSets: [[{
                id: '1', customId: 'E-999', order: 1,
                publishedRevisionId: null,
                structuredContent: null,
            }]],
        });

        expect(markup).toContain('problem-body-error');
        expect(markup).toContain('問題本文を表示できません');
    });

    it('structured problem でも別紙の解答用紙を出し、旧解答欄は本文に描画しない', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒D',
            studentLoginId: 'student-d',
            subjectName: '理科',
            problemSets: [[{
                id: 'structured-1',
                customId: 'S-101',
                order: 1,
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

    it('legacy caption / display が残っていても印刷では標準表示だけを使う', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒G',
            studentLoginId: 'student-g',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-display-1',
                customId: 'M-202',
                order: 1,
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
                ],
            }]],
        });

        expect(markup).not.toContain('problem-caption');
        expect(markup).not.toContain('problem-figure-pan');
        expect(markup).not.toContain('problem-figure-zoom');
        expect(markup).toContain('class="problem-figure-content"');
        expect(markup).toContain('style="width:100%;aspect-ratio:1.3333;"');
    });

    it('structured problem の directive ブロックを SVG 展開して印刷する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒H',
            studentLoginId: 'student-h',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-directive-1',
                customId: 'M-301',
                order: 1,
                publishedRevisionId: 'rev-directive-1',
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'p1', type: 'paragraph', text: '数直線を見て答えなさい。' },
                        {
                            id: 'd1',
                            type: 'directive',
                            kind: 'numberline',
                            source: '[[numberline min=-3 max=3 marks="A:-1,B:2"]]',
                        },
                    ],
                } as never,
                assets: [],
            }]],
        });

        expect(markup).toContain('problem-directive');
        expect(markup).toContain('<svg class="numberline"');
        expect(markup).not.toContain('[[numberline');
    });

    it('structured problem の本文で $...$ と $$...$$ を KaTeX 描画する', async () => {
        const { markup } = await buildPrintDocumentMarkup({
            studentName: '生徒F',
            studentLoginId: 'student-f',
            subjectName: '数学',
            problemSets: [[{
                id: 'structured-math-1',
                customId: 'M-201',
                order: 1,
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
