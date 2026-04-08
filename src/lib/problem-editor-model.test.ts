import { describe, expect, it } from 'vitest';

import { DEFAULT_PROBLEM_FIGURE_DISPLAY } from './problem-figure-display';
import type { StructuredProblemDocument } from './structured-problem';
import {
    deriveProblemTypeFromDocument,
    getProblemBodyCardAuthoringTool,
    hasEmptyProblemBodyCard,
    parseProblemBodySegments,
    syncAnswerSpecWithGradingMode,
    updateProblemBodyCard,
} from './problem-editor-model';

describe('problem-editor-model', () => {
    it('paragraph と図版と caption を1つのカードに fold する', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '放物線を見て答えなさい。' },
                { id: 'g1', type: 'graphAsset', assetId: 'asset-1', caption: '' },
                { id: 'c1', type: 'caption', text: '図1' },
            ],
        };

        const [segment] = parseProblemBodySegments(document.blocks);
        expect(segment).toEqual({
            kind: 'card',
            card: {
                id: 'p1',
                text: '放物線を見て答えなさい。',
                attachmentKind: 'graph',
                attachmentBlockType: 'graphAsset',
                assetId: 'asset-1',
                caption: '図1',
                display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
            },
        });
    });

    it('image/svg block は upload カードとして fold する', () => {
        const imageDocument: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '図を見て答えなさい。' },
                { id: 'i1', type: 'image', assetId: 'asset-image', src: '', alt: '', caption: '画像' },
            ],
        };

        const svgDocument: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p2', type: 'paragraph', text: '図を見て答えなさい。' },
                { id: 's1', type: 'svg', assetId: 'asset-svg', svg: '', caption: 'SVG' },
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
                caption: '画像',
                display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
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
                caption: 'SVG',
                display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
            },
        });
    });

    it('visual カードを更新すると graphAsset を維持したまま assetId を差し替える', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: 'グラフを見て答える。' },
                { id: 'p1-asset', type: 'graphAsset', assetId: 'before', caption: '図1' },
            ],
        };

        const nextDocument = updateProblemBodyCard(document, 'p1', (card) => ({
            ...card,
            assetId: 'after',
        }));

        expect(nextDocument.blocks).toEqual([
            { id: 'p1', type: 'paragraph', text: 'グラフを見て答える。' },
            { id: 'p1-asset', type: 'graphAsset', assetId: 'after', caption: '図1' },
        ]);
    });

    it('display 設定をカードと block の間で保持する', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '図を見て答える。' },
                {
                    id: 'p1-asset',
                    type: 'geometryAsset',
                    assetId: 'asset-1',
                    caption: '図1',
                    display: { zoom: 1.8, panX: 0.25, panY: -0.4 },
                },
            ],
        };

        const [segment] = parseProblemBodySegments(document.blocks);
        expect(segment).toEqual({
            kind: 'card',
            card: {
                id: 'p1',
                text: '図を見て答える。',
                attachmentKind: 'geometry',
                attachmentBlockType: 'geometryAsset',
                assetId: 'asset-1',
                caption: '図1',
                display: { zoom: 1.8, panX: 0.25, panY: -0.4 },
            },
        });

        const nextDocument = updateProblemBodyCard(document, 'p1', (card) => ({
            ...card,
            display: { zoom: 2.1, panX: -0.5, panY: 0.2 },
        }));

        expect(nextDocument.blocks).toEqual([
            { id: 'p1', type: 'paragraph', text: '図を見て答える。' },
            {
                id: 'p1-asset',
                type: 'geometryAsset',
                assetId: 'asset-1',
                caption: '図1',
                display: { zoom: 2.1, panX: -0.5, panY: 0.2 },
            },
        ]);
    });

    it('grading mode と答え種類を同期し、graph/geometry を優先して problemType を決める', () => {
        expect(syncAnswerSpecWithGradingMode(
            { kind: 'exact', correctAnswer: '3', acceptedAnswers: [] },
            'NUMERIC_TOLERANCE',
        )).toMatchObject({
            kind: 'numeric',
            correctAnswer: '3',
            acceptedAnswers: [],
            tolerance: 0,
        });

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'g1', type: 'graphAsset', assetId: 'asset-1', caption: '図1' }],
        }, 'EXACT')).toBe('GRAPH_DRAW');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'geom1', type: 'geometryAsset', assetId: 'asset-2', caption: '図2' }],
        }, 'FORMULA')).toBe('GEOMETRY');
    });

    it('本文も添付もないカードを検出する', () => {
        expect(hasEmptyProblemBodyCard([
            {
                id: 'c1',
                text: '',
                attachmentKind: 'none',
                attachmentBlockType: null,
                assetId: '',
                caption: '',
                display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
            },
        ])).toBe(true);

        expect(hasEmptyProblemBodyCard([
            {
                id: 'c2',
                text: '',
                attachmentKind: 'graph',
                attachmentBlockType: 'graphAsset',
                assetId: '',
                caption: '',
                display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
            },
        ])).toBe(false);
    });

    it('既存 GeoGebra revision がある geometry カードでは GeoGebra を優先する', () => {
        expect(getProblemBodyCardAuthoringTool({
            id: 'c-geometry',
            text: '図形を見て答える。',
            attachmentKind: 'geometry',
            attachmentBlockType: 'geometryAsset',
            assetId: 'asset-1',
            caption: '',
            display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
        })).toBe('SVG');

        expect(getProblemBodyCardAuthoringTool({
            id: 'c-geometry',
            text: '図形を見て答える。',
            attachmentKind: 'geometry',
            attachmentBlockType: 'geometryAsset',
            assetId: 'asset-1',
            caption: '',
            display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
        }, 'GEOGEBRA')).toBe('GEOGEBRA');

        expect(getProblemBodyCardAuthoringTool({
            id: 'c-graph',
            text: 'グラフを見て答える。',
            attachmentKind: 'graph',
            attachmentBlockType: 'graphAsset',
            assetId: 'asset-2',
            caption: '',
            display: DEFAULT_PROBLEM_FIGURE_DISPLAY,
        }, 'SVG')).toBe('GEOGEBRA');
    });
});
