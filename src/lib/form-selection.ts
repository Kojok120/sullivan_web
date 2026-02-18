export const NONE_SELECTION_VALUE = '__none__';

const LEGACY_NONE_SELECTION_VALUES = new Set([
    NONE_SELECTION_VALUE,
    'unselected',
]);

export function normalizeOptionalSelection(
    value: string | null | undefined
): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue || LEGACY_NONE_SELECTION_VALUES.has(normalizedValue)) {
        return undefined;
    }

    return normalizedValue;
}
