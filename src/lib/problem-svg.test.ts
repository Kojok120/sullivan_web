import { describe, expect, it } from 'vitest';

import { ensureRenderableSvgMarkup, normalizeSvgExport, scaleSvgMarkupDisplay } from './problem-svg';

describe('problem-svg', () => {
    it('data URL の SVG を復元できる', () => {
        const raw = 'data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%22120%22%20height%3D%2280%22%3E%3C%2Fsvg%3E';

        expect(normalizeSvgExport(raw)).toBe('<svg width="120" height="80"></svg>');
    });

    it('高さが 0 の SVG にフォールバック寸法を補う', () => {
        const raw = '<svg width="484" height="0"><path d="M0 0 L10 10" /></svg>';

        const normalized = ensureRenderableSvgMarkup(raw, { width: 1280, height: 960 });

        expect(normalized).toContain('width="484"');
        expect(normalized).toContain('height="363"');
        expect(normalized).toContain('viewBox="0 0 484 363"');
    });

    it('viewBox がない SVG に表示寸法ベースの viewBox を補う', () => {
        const raw = '<svg width="454" height="593"><path d="M0 0 L10 10" /></svg>';

        const normalized = ensureRenderableSvgMarkup(raw);

        expect(normalized).toContain('width="454"');
        expect(normalized).toContain('height="593"');
        expect(normalized).toContain('viewBox="0 0 454 593"');
    });

    it('表示寸法だけを倍率で縮小できる', () => {
        const raw = '<svg width="484" height="363"><path d="M0 0 L10 10" /></svg>';

        const scaled = scaleSvgMarkupDisplay(raw, 0.5);

        expect(scaled).toContain('width="242"');
        expect(scaled).toContain('height="182"');
    });
});
