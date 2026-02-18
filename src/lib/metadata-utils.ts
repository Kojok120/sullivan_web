export function toMetadataObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    return {};
}
