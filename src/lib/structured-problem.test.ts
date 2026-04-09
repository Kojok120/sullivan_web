import { describe, expect, it } from 'vitest';

import { parseStructuredDocument } from './structured-problem';

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
});
