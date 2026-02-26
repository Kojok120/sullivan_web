const DATE_KEY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const FALLBACK_TIME_ZONE = 'Asia/Tokyo';

function toPartsMap(parts: Intl.DateTimeFormatPart[]) {
    const map = new Map<string, string>();
    for (const part of parts) {
        map.set(part.type, part.value);
    }
    return map;
}

export function normalizeTimeZone(timeZone?: string | null): string {
    if (!timeZone) return FALLBACK_TIME_ZONE;

    try {
        new Intl.DateTimeFormat('ja-JP', { timeZone }).format(new Date());
        return timeZone;
    } catch {
        return FALLBACK_TIME_ZONE;
    }
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: safeTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const partMap = toPartsMap(parts);
    const year = partMap.get('year') ?? '1970';
    const month = partMap.get('month') ?? '01';
    const day = partMap.get('day') ?? '01';

    return `${year}-${month}-${day}`;
}

export function getTodayDateKey(timeZone: string): string {
    return getDateKeyInTimeZone(new Date(), timeZone);
}

export function isValidDateKey(value: string): boolean {
    const match = DATE_KEY_REGEX.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }

    return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() + 1 === month &&
        parsed.getUTCDate() === day;
}

export function parseDateKeyAsUTC(value: string): Date {
    if (!isValidDateKey(value)) {
        throw new Error(`Invalid dateKey: ${value}`);
    }

    return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateKeyFromUTC(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(dateKey: string, offsetDays: number): string {
    const date = parseDateKeyAsUTC(dateKey);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return formatDateKeyFromUTC(date);
}

export function listDateKeysBetween(startDateKey: string, endDateKey: string): string[] {
    if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
        return [];
    }

    if (startDateKey > endDateKey) {
        return [];
    }

    const keys: string[] = [];
    let current = startDateKey;

    while (current <= endDateKey) {
        keys.push(current);
        current = addDaysToDateKey(current, 1);
    }

    return keys;
}

export function getDateRangeAroundToday(timeZone: string, daysBefore: number, daysAfter: number) {
    const today = getTodayDateKey(timeZone);
    return {
        today,
        fromDateKey: addDaysToDateKey(today, -Math.max(0, daysBefore)),
        toDateKey: addDaysToDateKey(today, Math.max(0, daysAfter)),
    };
}

export function getBrowserTimeZoneSafe(): string {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
        return FALLBACK_TIME_ZONE;
    }

    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimeZone(resolved);
}
