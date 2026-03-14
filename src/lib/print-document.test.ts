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

    it('QRコード生成に失敗した場合は文脈付きのエラーを投げる', async () => {
        const qrSpy = vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('boom'));

        await expect(buildPrintDocumentMarkup({
            studentName: '生徒C',
            studentLoginId: 'student-c',
            subjectName: '国語',
            problemSets: [[{ id: '1', customId: 'J-1', question: 'question', order: 1 }]],
        })).rejects.toThrow('QRコード生成に失敗しました');

        qrSpy.mockRestore();
    });
});
