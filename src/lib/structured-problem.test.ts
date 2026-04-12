import { describe, expect, it } from 'vitest';

import {
    buildAiProblemText,
    collectStructuredDocumentAssetIds,
    normalizeAnswerSpecForAi,
    normalizeAnswerSpecForAuthoring,
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

    it('legacy な answerSpec を AI 採点向けの正解/別解へ正規化する', () => {
        expect(normalizeAnswerSpecForAi({
            kind: 'choice',
            correctChoiceId: 'B',
        })).toEqual({
            referenceAnswer: 'B',
            alternativeAnswers: [],
        });

        expect(normalizeAnswerSpecForAi({
            kind: 'multiBlank',
            blanks: [
                { id: 'b1', correctAnswer: '水', acceptedAnswers: ['みず'] },
                { id: 'b2', correctAnswer: '空気', acceptedAnswers: [] },
            ],
        })).toEqual({
            referenceAnswer: 'b1: 水\nb2: 空気',
            alternativeAnswers: ['b1: みず'],
        });
    });

    it('rubric 系 answerSpec を generic な exact answerSpec へ寄せる', () => {
        expect(normalizeAnswerSpecForAuthoring({
            kind: 'rubric',
            modelAnswer: '蒸散で温度調節をする。',
            rubric: '役割を説明できているかを見る。',
            criteria: [{ id: 'c1', label: '内容', description: '役割を説明する', maxPoints: 100 }],
        })).toEqual({
            kind: 'exact',
            correctAnswer: '模範解答:\n蒸散で温度調節をする。\n\n採点基準:\n役割を説明できているかを見る。\n\n観点:\n- 内容 (100点): 役割を説明する',
            acceptedAnswers: [],
        });
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
