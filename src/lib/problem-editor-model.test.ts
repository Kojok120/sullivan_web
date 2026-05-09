import { describe, expect, it } from 'vitest';

import type { StructuredProblemDocument } from './structured-problem';
import {
    appendProblemBodyCard,
    deriveProblemTypeFromDocument,
    hasEmptyProblemBodyCard,
    parseProblemBodySegments,
    updateProblemBodyCard,
} from './problem-editor-model';

const EMPTY_TABLE = { headers: [], rows: [] };

describe('problem-editor-model', () => {
    it('paragraph と image を 1 つの upload カードに fold し、legacy caption block は無視する', () => {
        const document = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '画像を見て答えなさい。' },
                { id: 'i1', type: 'image', assetId: 'asset-1', src: '', alt: '' },
                { id: 'c1', type: 'caption', text: '旧キャプション' },
            ],
        } as unknown as StructuredProblemDocument;

        const [segment, legacySegment] = parseProblemBodySegments(document.blocks);
        expect(segment).toEqual({
            kind: 'card',
            card: {
                id: 'p1',
                text: '画像を見て答えなさい。',
                attachmentKind: 'upload',
                attachmentBlockType: 'image',
                assetId: 'asset-1',
                tableData: EMPTY_TABLE,
                directiveSource: '',
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
                tableData: EMPTY_TABLE,
                directiveSource: '',
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
                tableData: EMPTY_TABLE,
                directiveSource: '',
            },
        });
    });

    it('paragraph と table block を 1 つの table カードに fold する', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p-table', type: 'paragraph', text: '下の表の空欄をうめなさい。' },
                {
                    id: 'p-table-asset',
                    type: 'table',
                    headers: ['x', 'y'],
                    rows: [['1', '2'], ['3', '4']],
                },
            ],
        };

        const segments = parseProblemBodySegments(document.blocks);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toEqual({
            kind: 'card',
            card: {
                id: 'p-table',
                text: '下の表の空欄をうめなさい。',
                attachmentKind: 'table',
                attachmentBlockType: 'table',
                assetId: '',
                tableData: {
                    headers: ['x', 'y'],
                    rows: [['1', '2'], ['3', '4']],
                },
                directiveSource: '',
            },
        });
    });

    it('table カードを更新するとヘッダー・行が反映され、structuredContent に table block として保存される', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p-table', type: 'paragraph', text: '下の表をうめなさい。' },
                {
                    id: 'p-table-asset',
                    type: 'table',
                    headers: ['x', 'y'],
                    rows: [['1', '2']],
                },
            ],
        };

        const next = updateProblemBodyCard(document, 'p-table', (card) => ({
            ...card,
            tableData: {
                headers: ['x', 'y', 'z'],
                rows: [['1', '2', '3'], ['4', '5', '6']],
            },
        }));

        expect(next.blocks).toEqual([
            { id: 'p-table', type: 'paragraph', text: '下の表をうめなさい。' },
            {
                id: 'p-table-asset',
                type: 'table',
                headers: ['x', 'y', 'z'],
                rows: [['1', '2', '3'], ['4', '5', '6']],
            },
        ]);
    });

    it('テキストが空の table カードでも table block を保持する', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p-table', type: 'paragraph', text: '' },
                {
                    id: 'p-table-asset',
                    type: 'table',
                    headers: ['a'],
                    rows: [['1']],
                },
            ],
        };

        const next = updateProblemBodyCard(document, 'p-table', (card) => ({
            ...card,
            text: '',
            tableData: { headers: ['a'], rows: [['9']] },
        }));

        expect(next.blocks).toEqual([
            {
                id: 'p-table-asset',
                type: 'table',
                headers: ['a'],
                rows: [['9']],
            },
        ]);
    });

    it('appendProblemBodyCard で空カードが追加され、table カードに切り替えても他カードに影響しない', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '最初のカード' },
            ],
        };

        const appended = appendProblemBodyCard(document);
        expect(appended.blocks).toHaveLength(2);

        const segments = parseProblemBodySegments(appended.blocks);
        expect(segments).toHaveLength(2);
        expect(segments[1].kind).toBe('card');
        if (segments[1].kind !== 'card') throw new Error('unreachable');
        const newCardId = segments[1].card.id;

        const switched = updateProblemBodyCard(appended, newCardId, (card) => ({
            ...card,
            attachmentKind: 'table',
            attachmentBlockType: 'table',
            tableData: {
                headers: ['x', 'y'],
                rows: [['1', '2'], ['3', '4']],
            },
        }));

        expect(switched.blocks[0]).toEqual({ id: 'p1', type: 'paragraph', text: '最初のカード' });
        expect(switched.blocks[1]).toEqual({
            id: `${newCardId}-asset`,
            type: 'table',
            headers: ['x', 'y'],
            rows: [['1', '2'], ['3', '4']],
        });
    });

    it('upload カードの assetId を差し替えても block 種別は維持される', () => {
        const document: StructuredProblemDocument = {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '画像を見て答える。' },
                { id: 'p1-asset', type: 'image', assetId: 'before', src: '', alt: '' },
            ],
        };

        const nextDocument = updateProblemBodyCard(document, 'p1', (card) => ({
            ...card,
            assetId: 'after',
        }));

        expect(nextDocument.blocks).toEqual([
            { id: 'p1', type: 'paragraph', text: '画像を見て答える。' },
            { id: 'p1-asset', type: 'image', assetId: 'after', src: '', alt: '' },
        ]);
    });

    it('deriveProblemTypeFromDocument は fallback をそのまま返す', () => {
        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [{ id: 'p1', type: 'paragraph', text: '説明しなさい。' }],
        }, 'SHORT_TEXT')).toBe('SHORT_TEXT');

        expect(deriveProblemTypeFromDocument({
            version: 1,
            blocks: [],
        }, '')).toBe('SHORT_TEXT');
    });

    it('本文も添付もないカードを検出する', () => {
        expect(hasEmptyProblemBodyCard([
            {
                id: 'c1',
                text: '',
                attachmentKind: 'none',
                attachmentBlockType: null,
                assetId: '',
                tableData: EMPTY_TABLE,
                directiveSource: '',
            },
        ])).toBe(true);

        expect(hasEmptyProblemBodyCard([
            {
                id: 'c2',
                text: '',
                attachmentKind: 'upload',
                attachmentBlockType: 'image',
                assetId: 'asset-x',
                tableData: EMPTY_TABLE,
                directiveSource: '',
            },
        ])).toBe(false);

        expect(hasEmptyProblemBodyCard([
            {
                id: 'c3',
                text: '',
                attachmentKind: 'table',
                attachmentBlockType: 'table',
                assetId: '',
                tableData: { headers: ['x'], rows: [['1']] },
                directiveSource: '',
            },
        ])).toBe(false);
    });
});
