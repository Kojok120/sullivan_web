import { describe, expect, it } from 'vitest';

import { addDaysToDateKey, listDateKeysBetween } from '../date-key';

describe('date-key utility', () => {
    it('offsetDays が有限整数でない場合は addDaysToDateKey が失敗する', () => {
        expect(() => addDaysToDateKey('2026-02-01', Number.NaN)).toThrow('Invalid offsetDays');
        expect(() => addDaysToDateKey('2026-02-01', Number.POSITIVE_INFINITY)).toThrow('Invalid offsetDays');
        expect(() => addDaysToDateKey('2026-02-01', 1.5)).toThrow('Invalid offsetDays');
    });

    it('listDateKeysBetween は過大な期間を空配列として扱う', () => {
        const result = listDateKeysBetween('2000-01-01', '2020-01-01');
        expect(result).toEqual([]);
    });
});
