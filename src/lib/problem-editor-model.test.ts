import { describe, expect, it } from 'vitest';

import type { StructuredProblemDocument } from './structured-problem';
import {
    deriveProblemTypeFromDocument,
    getProblemBodyCardAuthoringTool,
    hasEmptyProblemBodyCard,
    parseProblemBodySegments,
    updateProblemBodyCard,
} from './problem-editor-model';

describe('problem-editor-model', () => {
    it('paragraph と図版を 1 つのカードに fold し、legacy caption block は無視する', () => {
        const document = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '放物線を見て答えなさい。' },
                { id: 'g1', type: 'graphAsset', assetId: 'asset-1' },
                { id: 'c1', type: 'caption', text: '旧キャプション' },
            ],
        } as unknown as StructuredProblemDocument;

        const [segment, legacySegment] = parseProblemBodySegments(document.blocks);
        expect(segment).toEqual({
            kind: 'card',
            card: {
                id: 'p1',
                text: '放物線を見て答えなさい。',
                attachmentKind: 'graph',
                attachmentBlockType: 'graphAsset',
                assetId: 'asset-1',
            },
        });
        expect(legacySegment).toEqual({
            kind: 'legacy',
            block: { id: 'c1', type: 'caption', text: '旧キャプション' },
        });
    });

    it('image/svg block は upload カードとして fold する', () => {
        const imageDocument: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '図を見て答えなさい。' },
                { id: 'i1', type: 'image', assetId: 'asset-image', src: '', alt: '' },
            ],
        };

        const svgDocument: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p2', type: 'paragraph', text: '図を見て答えなさい。' },
                { id: 's1', type: 'svg', assetId: 'asset-svg', svg: '' },
            ],
        };

        expect(parseProblemBodySegments(imageDocument.blocks)[0]).toEqual({
            kind: 'card',
            card: {
                id: 'p1',
                text: '図を見て答えなさい。',
                attachmentKind: 'upload',
                attachmentBlockType: 'image',
                assetId: 'asset-image',
            },
        });

        expect(parseProblemBodySegments(svgDocument.blocks)[0]).toEqual({
            kind: 'card',
            card: {
                id: 'p2',
                text: '図を見て答えなさい。',
                attachmentKind: 'upload',
                attachmentBlockType: 'svg',
                assetId: 'asset-svg',
            },
        });
    });

    it('visual カードを更新すると graphAsset を維持したまま assetId を差し替える', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: 'グラフを見て答える。' },
                { id: 'p1-asset', type: 'graphAsset', assetId: 'before' },
            ],
        };

        const nextDocument = updateProblemBodyCard(document, 'p1', (card) => ({
            ...card,
            assetId: 'after',
        }));

        expect(nextDocument.blocks).toEqual([
            { id: 'p1', type: 'paragraph', text: 'グラフを見て答える。' },
            { id: 'p1-asset', type: 'graphAsset', assetId: 'after' },
        ]);
    });

    it('図版ブロックだけで problemType を補正し、それ以外は SHORT_TEXT に寄せる', () => {
        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'g1', type: 'graphAsset', assetId: 'asset-1' }],
        }, 'SHORT_TEXT')).toBe('GRAPH_DRAW');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'geom1', type: 'geometryAsset', assetId: 'asset-2' }],
        }, 'SHORT_TEXT')).toBe('GEOMETRY');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'choice-1', type: 'choices', options: [{ id: 'A', label: '1' }, { id: 'B', label: '2' }] }],
        }, 'SHORT_TEXT')).toBe('SHORT_TEXT');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'blank-1', type: 'blankGroup', blanks: [{ id: 'b1', label: '空欄1' }] }],
        }, 'SHORT_TEXT')).toBe('SHORT_TEXT');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'p1', type: 'paragraph', text: '説明しなさい。' }],
        }, 'GRAPH_DRAW')).toBe('SHORT_TEXT');
    });

    it('本文も添付もないカードを検出する', () => {
        expect(hasEmptyProblemBodyCard([
            {
                id: 'c1',
                text: '',
                attachmentKind: 'none',
                attachmentBlockType: null,
                assetId: '',
            },
        ])).toBe(true);

        expect(hasEmptyProblemBodyCard([
            {
                id: 'c2',
                text: '',
                attachmentKind: 'graph',
                attachmentBlockType: 'graphAsset',
                assetId: '',
            },
        ])).toBe(false);
    });

    it('geometry カードでは preferredAuthoringTool に応じて GeoGebra を優先する', () => {
        expect(getProblemBodyCardAuthoringTool({
            id: 'c-geometry',
            text: '図形を見て答える。',
            attachmentKind: 'geometry',
            attachmentBlockType: 'geometryAsset',
            assetId: 'asset-1',
        })).toBe('SVG');

        expect(getProblemBodyCardAuthoringTool({
            id: 'c-geometry',
            text: '図形を見て答える。',
            attachmentKind: 'geometry',
            attachmentBlockType: 'geometryAsset',
            assetId: 'asset-1',
        }, 'GEOGEBRA')).toBe('GEOGEBRA');

        expect(getProblemBodyCardAuthoringTool({
            id: 'c-graph',
            text: 'グラフを見て答える。',
            attachmentKind: 'graph',
            attachmentBlockType: 'graphAsset',
            assetId: 'asset-2',
        }, 'SVG')).toBe('GEOGEBRA');
    });
});
