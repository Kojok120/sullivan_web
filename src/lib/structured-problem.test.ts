import { describe, expect, it } from 'vitest';

import {
    buildAiProblemText,
    collectStructuredDocumentAssetIds,
    normalizeAnswerSpecForAi,
    normalizeAnswerSpecForAuthoring,
    parseAnswerSpec,
    parseStructuredDocument,
} from './structured-problem';

describe('structured-problem', () => {
    it('legacy caption / display / caption block を読み込み時に捨てる', () => {
        const document = parseStructuredDocument({
            version: 1,
            blocks: [
                {
                    id: 'image-1',
                    type: 'image',
                    assetId: 'asset-image',
                    caption: '図1',
                    display: { zoom: 0.6, panX: 0.1, panY: -0.2 },
                },
                {
                    id: 'table-1',
                    type: 'table',
                    headers: ['x'],
                    rows: [['1']],
                    caption: '表1',
                },
                {
                    id: 'caption-1',
                    type: 'caption',
                    text: '旧キャプション',
                },
            ],
        });

        expect(document.blocks).toEqual([
            {
                id: 'image-1',
                type: 'image',
                assetId: 'asset-image',
            },
            {
                id: 'table-1',
                type: 'table',
                headers: ['x'],
                rows: [['1']],
            },
        ]);
    });

    it('answerSpec を AI 採点向けの正解/別解へ正規化する', () => {
        expect(normalizeAnswerSpecForAi({
            correctAnswer: 'B',
            acceptedAnswers: [],
        })).toEqual({
            referenceAnswer: 'B',
            alternativeAnswers: [],
        });

        expect(normalizeAnswerSpecForAi({
            correctAnswer: '水',
            acceptedAnswers: ['みず', ' 水 '],
        })).toEqual({
            referenceAnswer: '水',
            alternativeAnswers: ['みず', '水'],
        });
    });

    it('authoring 向け answerSpec を trim 済みの最小形へ寄せる', () => {
        expect(normalizeAnswerSpecForAuthoring({
            correctAnswer: '  蒸散で温度調節をする。 ',
            acceptedAnswers: [' 蒸散 ', '', '蒸散'],
        })).toEqual({
            correctAnswer: '蒸散で温度調節をする。',
            acceptedAnswers: ['蒸散'],
        });
    });

    it('answerSpec は正解と別解配列だけを受け付ける', () => {
        expect(parseAnswerSpec({
            correctAnswer: '20',
            acceptedAnswers: ['20cm^2'],
        })).toEqual({
            correctAnswer: '20',
            acceptedAnswers: ['20cm^2'],
        });
    });

    it('legacy な余計なキーを含む answerSpec は受け付けない', () => {
        expect(() => parseAnswerSpec({
            kind: 'choice',
            correctAnswer: '20',
            acceptedAnswers: ['20cm^2'],
        })).toThrow();
    });

    it('AI 向け problemText に表や選択肢や空欄情報を含め、参照 asset を集める', () => {
        const document = parseStructuredDocument({
            version: 1,
            title: '水溶液',
            summary: '表を見て答える',
            instructions: '当てはまるものを選ぶ',
            blocks: [
                { id: 'p1', type: 'paragraph', text: '次の表と図を見なさい。' },
                { id: 'k1', type: 'katexInline', latex: 'x^2' },
                { id: 't1', type: 'table', headers: ['物質', '性質'], rows: [['水', '液体']] },
                { id: 'c1', type: 'choices', options: [{ id: 'A', label: '酸性' }, { id: 'B', label: '中性' }] },
                { id: 'b1', type: 'blankGroup', blanks: [{ id: 'blank-1', label: '物質名', placeholder: '例: 水' }] },
                { id: 'g1', type: 'graphAsset', assetId: 'asset-graph' },
                { id: 'i1', type: 'image', assetId: 'asset-image' },
            ],
        });

        expect(buildAiProblemText(document)).toContain('タイトル: 水溶液');
        expect(buildAiProblemText(document)).toContain('表:');
        expect(buildAiProblemText(document)).toContain('選択肢:');
        expect(buildAiProblemText(document)).toContain('空欄:');
        expect(collectStructuredDocumentAssetIds(document)).toEqual(['asset-graph', 'asset-image']);
    });
});
