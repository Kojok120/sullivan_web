import { describe, expect, it } from 'vitest';

import { parseStructuredDocument } from './structured-problem';

describe('structured-problem', () => {
    it('図版 block の display を構造化ドキュメントとして受け入れる', () => {
        const document = parseStructuredDocument({
            version: 1,
            blocks: [
                {
                    id: 'image-1',
                    type: 'image',
                    assetId: 'asset-image',
                    display: { zoom: 0.6, panX: 0.1, panY: -0.2 },
                },
                {
                    id: 'svg-1',
                    type: 'svg',
                    svg: '<svg width="10" height="10"></svg>',
                    display: { zoom: 1.5, panX: -0.3, panY: 0.4 },
                },
                {
                    id: 'graph-1',
                    type: 'graphAsset',
                    assetId: 'asset-graph',
                    display: { zoom: 2, panX: 0.5, panY: -0.6 },
                },
                {
                    id: 'geometry-1',
                    type: 'geometryAsset',
                    assetId: 'asset-geometry',
                    display: { zoom: 2.5, panX: -0.7, panY: 0.8 },
                },
            ],
        });

        expect(document.blocks).toMatchObject([
            { id: 'image-1', display: { zoom: 0.6, panX: 0.1, panY: -0.2 } },
            { id: 'svg-1', display: { zoom: 1.5, panX: -0.3, panY: 0.4 } },
            { id: 'graph-1', display: { zoom: 2, panX: 0.5, panY: -0.6 } },
            { id: 'geometry-1', display: { zoom: 2.5, panX: -0.7, panY: 0.8 } },
        ]);
    });
});
