
export type QRData = {
    s?: string; // Student ID (LoginID)
    p?: string; // Comma-separated full IDs
    c?: string; // Compressed format: "<prefix>|<ranges>"
};

// Compression Helpers
export function compressProblemIds(ids: string[]): Partial<QRData> {
    if (ids.length === 0) return { p: '' };

    // Regex to capture "Prefix-Number" (e.g. "E-151" -> "E", "151")
    // Assumes customId format is "Subject-Number" or similar.
    // Adjust regex if format differs. Taking flexible approach: "Anything-Number"
    const regex = /^([a-zA-Z]+)-(\d+)$/;

    // Check first item
    const firstMatch = ids[0].match(regex);
    if (!firstMatch) {
        // Fallback to full list if first item doesn't match
        return { p: ids.join(',') };
    }

    const commonPrefix = firstMatch[1];
    const numbers: number[] = [];

    // Verify all items match and have same prefix
    for (const id of ids) {
        const match = id.match(regex);
        if (!match || match[1] !== commonPrefix) {
            // Mixed or invalid format -> Fallback
            return { p: ids.join(',') };
        }
        numbers.push(parseInt(match[2], 10)); // Store as number for compactness
    }

    const ranges = compressNumberRanges(numbers);
    return { c: `${commonPrefix}|${ranges}` };
}

export function expandProblemIds(data: QRData): string[] {
    if (data.p) {
        return data.p.split(',').map((id) => id.trim()).filter(Boolean);
    }

    if (data.c) {
        const [prefix, ranges] = data.c.split('|');
        if (!prefix || ranges === undefined) return [];
        return expandNumberRanges(prefix, ranges);
    }
    return [];
}

function compressNumberRanges(numbers: number[]): string {
    if (numbers.length === 0) return '';
    const parts: string[] = [];
    let start = numbers[0];
    let prev = numbers[0];

    for (let i = 1; i < numbers.length; i++) {
        const current = numbers[i];
        if (current === prev + 1) {
            prev = current;
            continue;
        }
        parts.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = current;
        prev = current;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    return parts.join(',');
}

function expandNumberRanges(prefix: string, ranges: string): string[] {
    const result: string[] = [];
    const parts = ranges.split(',').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
        const [startStr, endStr] = part.split('-', 2);
        const start = parseInt(startStr, 10);
        if (Number.isNaN(start)) continue;
        if (!endStr) {
            result.push(`${prefix}-${start}`);
            continue;
        }
        const end = parseInt(endStr, 10);
        if (Number.isNaN(end)) continue;
        const step = start <= end ? 1 : -1;
        for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
            result.push(`${prefix}-${n}`);
        }
    }
    return result;
}
