import { describe, expect, it } from 'vitest';

import { addDaysToDateKey, isValidDateKey, listDateKeysBetween, parseDateKeyAsUTC } from '../date-key';

describe('date-key utility', () => {
    it('addDaysToDateKey は月末・年末をまたぐ加減算を正しく処理する', () => {
        expect(addDaysToDateKey('2026-01-31', 1)).toBe('2026-02-01');
        expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31');
        expect(addDaysToDateKey('2026-12-30', 2)).toBe('2027-01-01');
    });

    it('offsetDays が有限整数でない場合は addDaysToDateKey が失敗する', () => {
        expect(() => addDaysToDateKey('2026-02-01', Number.NaN)).toThrow('Invalid offsetDays');
        expect(() => addDaysToDateKey('2026-02-01', Number.POSITIVE_INFINITY)).toThrow('Invalid offsetDays');
        expect(() => addDaysToDateKey('2026-02-01', 1.5)).toThrow('Invalid offsetDays');
    });

    it('listDateKeysBetween は小さな範囲の日付キーを連続で返す', () => {
        const result = listDateKeysBetween('2026-02-01', '2026-02-05');
        expect(result).toEqual([
            '2026-02-01',
            '2026-02-02',
            '2026-02-03',
            '2026-02-04',
            '2026-02-05',
        ]);
    });

    it('listDateKeysBetween は過大な期間を空配列として扱う', () => {
        const result = listDateKeysBetween('2000-01-01', '2020-01-01');
        expect(result).toEqual([]);
    });

    it('isValidDateKey は有効・無効フォーマットを判定する', () => {
        expect(isValidDateKey('2026-02-28')).toBe(true);
        expect(isValidDateKey('2026-02-30')).toBe(false);
        expect(isValidDateKey('2026/02/28')).toBe(false);
        expect(isValidDateKey('not-a-date')).toBe(false);
    });

    it('parseDateKeyAsUTC はUTC基準のDateを返す', () => {
        const parsed = parseDateKeyAsUTC('2026-02-01');
        expect(parsed.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });
});
