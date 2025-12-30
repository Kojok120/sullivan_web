
export type QRData = {
    sid: string; // Student ID (LoginID or CUID)
    pids?: string[]; // Legacy or fallback full IDs
    sub?: string; // Subject prefix (e.g. "E")
    nos?: (string | number)[]; // Numbers (e.g. [1, 2])
};

// Compression Helpers
export function compressProblemIds(ids: string[]): Partial<QRData> {
    if (ids.length === 0) return { pids: [] };

    // Regex to capture "Prefix-Number" (e.g. "E-151" -> "E", "151")
    // Assumes customId format is "Subject-Number" or similar.
    // Adjust regex if format differs. Taking flexible approach: "Anything-Number"
    const regex = /^([a-zA-Z]+)-(\d+)$/;

    // Check first item
    const firstMatch = ids[0].match(regex);
    if (!firstMatch) {
        // Fallback to full list if first item doesn't match
        return { pids: ids };
    }

    const commonPrefix = firstMatch[1];
    const numbers: (string | number)[] = [];

    // Verify all items match and have same prefix
    for (const id of ids) {
        const match = id.match(regex);
        if (!match || match[1] !== commonPrefix) {
            // Mixed or invalid format -> Fallback
            return { pids: ids };
        }
        numbers.push(parseInt(match[2], 10)); // Store as number for compactness
    }

    return { sub: commonPrefix, nos: numbers };
}
