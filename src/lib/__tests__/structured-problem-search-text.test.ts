import { describe, expect, it } from 'vitest';

import { extractSearchTextFromRevision } from '../structured-problem';

describe('extractSearchTextFromRevision', () => {
    it('paragraph テキスト / summary / instructions を行区切りで連結する', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                summary: '光合成の単元',
                instructions: '次の問いに答えなさい',
                blocks: [
                    { id: 'p1', type: 'paragraph', text: '葉の表面にある気孔は何か' },
                    { id: 'p2', type: 'paragraph', text: '気体の出入り口である' },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain('光合成の単元');
        expect(result).toContain('次の問いに答えなさい');
        expect(result).toContain('葉の表面にある気孔は何か');
        expect(result).toContain('気体の出入り口である');
    });

    it('katexInline / katexDisplay の latex 文字列を含める', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    { id: 'k1', type: 'katexInline', latex: 'x^2 + y^2 = r^2' },
                    { id: 'k2', type: 'katexDisplay', latex: '\\int_0^1 x \\, dx' },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain('x^2 + y^2 = r^2');
        expect(result).toContain('\\int_0^1 x \\, dx');
    });

    it('table のヘッダーとセルを含める', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    {
                        id: 't1',
                        type: 'table',
                        headers: ['国名', '首都'],
                        rows: [
                            ['日本', '東京'],
                            ['フランス', 'パリ'],
                        ],
                    },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain('国名');
        expect(result).toContain('首都');
        expect(result).toContain('日本');
        expect(result).toContain('東京');
        expect(result).toContain('フランス');
        expect(result).toContain('パリ');
    });

    it('choices の option label を含める', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    {
                        id: 'c1',
                        type: 'choices',
                        options: [
                            { id: 'a', label: '酸素' },
                            { id: 'b', label: '二酸化炭素' },
                            { id: 'c', label: '窒素' },
                        ],
                    },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain('酸素');
        expect(result).toContain('二酸化炭素');
        expect(result).toContain('窒素');
    });

    it('blankGroup の blank label / placeholder を含める', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    {
                        id: 'b1',
                        type: 'blankGroup',
                        blanks: [
                            { id: 'b1-1', label: '元素記号', placeholder: '例: H' },
                            { id: 'b1-2', label: '原子番号' },
                        ],
                    },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain('元素記号');
        expect(result).toContain('例: H');
        expect(result).toContain('原子番号');
    });

    it('directive ブロックの source を含める', () => {
        const directiveSource = '[[numberline range="-5..5"]]';
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    { id: 'd1', type: 'directive', kind: 'numberline', source: directiveSource },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result).toContain(directiveSource);
    });

    it('correctAnswer と acceptedAnswers を含める', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    { id: 'p1', type: 'paragraph', text: '本文' },
                ],
            },
            correctAnswer: '正解',
            acceptedAnswers: ['別解1', '別解2'],
        });

        expect(result).toContain('正解');
        expect(result).toContain('別解1');
        expect(result).toContain('別解2');
    });

    it('structuredContent が壊れていても correctAnswer / acceptedAnswers は拾う', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: { malformed: 'not a structured document' },
            correctAnswer: '正解値',
            acceptedAnswers: ['accepted1'],
        });

        expect(result).toContain('正解値');
        expect(result).toContain('accepted1');
    });

    it('structuredContent が null でも例外を投げない', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: null,
            correctAnswer: 'ans',
            acceptedAnswers: [],
        });

        expect(result).toBe('ans');
    });

    it('全フィールドが空なら空文字を返す', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: null,
            correctAnswer: null,
            acceptedAnswers: null,
        });

        expect(result).toBe('');
    });

    it('連結結果は 8000 文字でカットする', () => {
        const longText = 'あ'.repeat(10000);
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    { id: 'p1', type: 'paragraph', text: longText },
                ],
            },
            correctAnswer: null,
            acceptedAnswers: [],
        });

        expect(result.length).toBe(8000);
    });

    it('空白のみの値は除外する', () => {
        const result = extractSearchTextFromRevision({
            structuredContent: {
                version: 1,
                blocks: [
                    { id: 'p1', type: 'paragraph', text: '   ' },
                    { id: 'p2', type: 'paragraph', text: '実体のある本文' },
                ],
            },
            correctAnswer: '   ',
            acceptedAnswers: ['', '別解'],
        });

        const lines = result.split('\n');
        expect(lines).toContain('実体のある本文');
        expect(lines).toContain('別解');
        // 空白だけの行は混ざらない
        expect(lines.every((line) => line.trim().length > 0)).toBe(true);
    });
});
