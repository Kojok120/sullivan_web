import { describe, expect, it } from 'vitest';

import {
    buildAiProblemText,
    collectStructuredDocumentAssetIds,
    normalizeAnswerForAuthoring,
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

    it('Stage B\': 正解情報は normalizeAnswerForAuthoring で trim & 重複排除される', () => {
        expect(normalizeAnswerForAuthoring({
            correctAnswer: '  蒸散で温度調節をする。 ',
            acceptedAnswers: [' 蒸散 ', '', '蒸散'],
        })).toEqual({
            correctAnswer: '蒸散で温度調節をする。',
            acceptedAnswers: ['蒸散'],
        });
    });

    it('Stage B\': normalizeAnswerForAuthoring は null/undefined を空値として扱う', () => {
        expect(normalizeAnswerForAuthoring({
            correctAnswer: null,
            acceptedAnswers: undefined,
        })).toEqual({
            correctAnswer: '',
            acceptedAnswers: [],
        });
    });

    it('authoring 向け answerSpec は answerTemplate のみ保持する (Stage B\' で正解情報は分離)', () => {
        expect(normalizeAnswerSpecForAuthoring({
            answerTemplate: '  [[numberline min=-5 max=5]]  ',
        })).toEqual({
            answerTemplate: '[[numberline min=-5 max=5]]',
        });
    });

    it('authoring 向け answerSpec で空テンプレートは undefined に寄せる', () => {
        expect(normalizeAnswerSpecForAuthoring({
            answerTemplate: '   ',
        })).toEqual({
            answerTemplate: undefined,
        });
    });

    it('legacy DB の answerSpec (correctAnswer / acceptedAnswers キー含む) を passthrough で読める', () => {
        // Stage B' 移行直後は既存 DB 行に旧キーが残るため、parse はエラーにしない方針。
        // ただし normalizeAnswerSpecForAuthoring を通すと旧キーは破棄される。
        const parsed = parseAnswerSpec({
            correctAnswer: '20',
            acceptedAnswers: ['20cm^2'],
            answerTemplate: '[[numberline]]',
        });
        // passthrough なので未知キーは型としては素通り
        expect(parsed.answerTemplate).toBe('[[numberline]]');
        expect(normalizeAnswerSpecForAuthoring(parsed)).toEqual({
            answerTemplate: '[[numberline]]',
        });
    });

    it('AI 向け problemText に表や選択肢や空欄情報を含め、参照 asset を集める', () => {
        const document = parseStructuredDocument({
            version: 1,
            summary: '表を見て答える',
            instructions: '当てはまるものを選ぶ',
            blocks: [
                { id: 'p1', type: 'paragraph', text: '次の表と図を見なさい。' },
                { id: 'k1', type: 'katexInline', latex: 'x^2' },
                { id: 't1', type: 'table', headers: ['物質', '性質'], rows: [['水', '液体']] },
                { id: 'c1', type: 'choices', options: [{ id: 'A', label: '酸性' }, { id: 'B', label: '中性' }] },
                { id: 'b1', type: 'blankGroup', blanks: [{ id: 'blank-1', label: '物質名', placeholder: '例: 水' }] },
                { id: 'i1', type: 'image', assetId: 'asset-image' },
            ],
        });

        expect(buildAiProblemText(document)).toContain('概要: 表を見て答える');
        expect(buildAiProblemText(document)).toContain('表:');
        expect(buildAiProblemText(document)).toContain('選択肢:');
        expect(buildAiProblemText(document)).toContain('空欄:');
        expect(collectStructuredDocumentAssetIds(document)).toEqual(['asset-image']);
    });

    it('legacy な graphAsset / geometryAsset ブロックは読み込み時に黙って捨てる', () => {
        const document = parseStructuredDocument({
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '本文' },
                { id: 'g1', type: 'graphAsset', assetId: 'legacy-graph' },
                { id: 'geom1', type: 'geometryAsset', assetId: 'legacy-geom' },
            ],
        });
        expect(document.blocks).toHaveLength(1);
        expect(document.blocks[0].type).toBe('paragraph');
    });
});
