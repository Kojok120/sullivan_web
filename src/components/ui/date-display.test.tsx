import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FALLBACK_TIME_ZONE, normalizeTimeZone } from '@/lib/date-key';

import { DateDisplay } from './date-display';

function normalizeTextContent(textContent: string | null) {
    return (textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('DateDisplay', () => {
    it('timeZone 未指定時は日本時間で表示する', () => {
        const date = new Date('2024-01-15T18:30:00.000Z');
        const expectedDate = date.toLocaleDateString('ja-JP', { timeZone: FALLBACK_TIME_ZONE });
        const expectedTime = date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: FALLBACK_TIME_ZONE,
        });
        const unexpectedUtc = `${date.toLocaleDateString('ja-JP', { timeZone: 'UTC' })} ${date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
        })}`;

        const { container } = render(<DateDisplay date={date} showTime />);
        const actual = normalizeTextContent(container.textContent);

        expect(actual).toContain(`${expectedDate} ${expectedTime}`);
        expect(actual).not.toContain(unexpectedUtc);
    });

    it('timeZone が指定されていればその値を優先する', () => {
        const date = new Date('2024-01-15T18:30:00.000Z');
        const expectedDate = date.toLocaleDateString('ja-JP', { timeZone: 'UTC' });
        const expectedTime = date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
        });

        const { container } = render(<DateDisplay date={date} showTime timeZone="UTC" />);
        const actual = normalizeTextContent(container.textContent);

        expect(actual).toContain(`${expectedDate} ${expectedTime}`);
    });

    it('不正な timeZone 指定時はフォールバックを使う', () => {
        const date = new Date('2024-01-15T18:30:00.000Z');
        const resolvedTimeZone = normalizeTimeZone('Invalid/Zone');
        const expectedDate = date.toLocaleDateString('ja-JP', { timeZone: FALLBACK_TIME_ZONE });
        const expectedTime = date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: FALLBACK_TIME_ZONE,
        });

        const { container } = render(<DateDisplay date={date} showTime timeZone="Invalid/Zone" />);
        const actual = normalizeTextContent(container.textContent);

        expect(resolvedTimeZone).toBe(FALLBACK_TIME_ZONE);
        expect(actual).toContain(`${expectedDate} ${expectedTime}`);
    });
});
