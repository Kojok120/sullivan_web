import { describe, expect, it } from 'vitest';

import { getSubjectPrefix } from './subject-config';

describe('subject-config', () => {
    it('教科ごとのQR prefixを E/M/S/N で返す', () => {
        expect(getSubjectPrefix('英語')).toBe('E');
        expect(getSubjectPrefix('数学')).toBe('M');
        expect(getSubjectPrefix('理科')).toBe('S');
        expect(getSubjectPrefix('国語')).toBe('N');
    });
});
