type NamedItem = {
    name: string;
};

export function normalizeCoreProblemName(name: string): string {
    return name.trim();
}

export function dedupeByCoreProblemName<T extends NamedItem>(items: T[]): T[] {
    const uniqueItems = new Map<string, T>();

    for (const item of items) {
        const normalizedName = normalizeCoreProblemName(item.name);
        if (!normalizedName || uniqueItems.has(normalizedName)) {
            continue;
        }

        uniqueItems.set(normalizedName, {
            ...item,
            name: normalizedName,
        });
    }

    return Array.from(uniqueItems.values());
}
