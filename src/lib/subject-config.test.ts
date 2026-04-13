import { describe, expect, it } from 'vitest';

import { getSubjectPrefix } from './subject-config';

describe('subject-config', () => {
    it('教科ごとのQR prefixを E/M/S/N で返す', () => {
        expect(getSubjectPrefix('英語')).toBe('E');
        expect(getSubjectPrefix('数学')).toBe('M');
        expect(getSubjectPrefix('理科')).toBe('S');
        expect(getSubjectPrefix('国語')).toBe('N');
    });

    it('未定義の教科名は先頭文字を fallback に使う', () => {
        expect(getSubjectPrefix('社会')).toBe('社');
    });

    it('空文字は ? を返す', () => {
        expect(getSubjectPrefix('')).toBe('?');
    });

    it('文字列以外は例外にする', () => {
        expect(() => getSubjectPrefix(undefined as unknown as string)).toThrow();
        expect(() => getSubjectPrefix(null as unknown as string)).toThrow();
    });
});
