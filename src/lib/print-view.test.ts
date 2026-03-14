import { describe, expect, it } from 'vitest';

import {
    detectPreferredPrintViewFromEnvironment,
    sanitizePrintView,
} from './print-view';

describe('print-view', () => {
    it('iPhone Safari は HTML 印刷を優先する', () => {
        expect(detectPreferredPrintViewFromEnvironment({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            platform: 'iPhone',
            maxTouchPoints: 5,
            coarsePointer: true,
        })).toBe('html');
    });

    it('Android Chrome は HTML 印刷を優先する', () => {
        expect(detectPreferredPrintViewFromEnvironment({
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
            platform: 'Linux armv8l',
            maxTouchPoints: 5,
            coarsePointer: true,
        })).toBe('html');
    });

    it('タッチ対応 iPad は HTML 印刷を優先する', () => {
        expect(detectPreferredPrintViewFromEnvironment({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            platform: 'MacIntel',
            maxTouchPoints: 5,
            coarsePointer: true,
        })).toBe('html');
    });

    it('デスクトップ環境は PDF プレビューを維持する', () => {
        expect(detectPreferredPrintViewFromEnvironment({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
            platform: 'MacIntel',
            maxTouchPoints: 0,
            coarsePointer: false,
        })).toBe('pdf');
    });

    it('view パラメータは html 以外を pdf に正規化する', () => {
        expect(sanitizePrintView('html')).toBe('html');
        expect(sanitizePrintView('pdf')).toBe('pdf');
        expect(sanitizePrintView('unexpected')).toBe('pdf');
        expect(sanitizePrintView(undefined)).toBe('pdf');
    });
});
