const SVG_UTF8_PREFIX = 'data:image/svg+xml;charset=utf-8,';
const SVG_BASE64_PREFIX = 'data:image/svg+xml;base64,';

function decodeBase64(value: string) {
    if (typeof atob === 'function') {
        return atob(value);
    }

    return Buffer.from(value, 'base64').toString('utf8');
}

function parseSvgAttribute(markup: string, name: string) {
    const match = markup.match(new RegExp(`${name}=(["'])(.*?)\\1`, 'i'));
    return match?.[2] ?? null;
}

function parseSvgDimension(value: string | null) {
    if (!value) return null;
    const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
    if (!match) return null;

    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseSvgViewBox(markup: string) {
    const viewBox = parseSvgAttribute(markup, 'viewBox');
    if (!viewBox) {
        return null;
    }

    const parts = viewBox
        .trim()
        .split(/[\s,]+/)
        .map((part) => Number.parseFloat(part));

    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    const width = parts[2];
    const height = parts[3];
    if (width <= 0 || height <= 0) {
        return null;
    }

    return { width, height };
}

function replaceSvgAttribute(markup: string, name: string, value: string) {
    return markup.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
        const attributePattern = new RegExp(`\\b${name}=(["']).*?\\1`, 'i');
        if (attributePattern.test(attrs)) {
            return `<svg${attrs.replace(attributePattern, `${name}="${value}"`)}>`;
        }

        return `<svg${attrs} ${name}="${value}">`;
    });
}

export function normalizeSvgExport(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<svg')) return trimmed;

    if (trimmed.startsWith(SVG_UTF8_PREFIX)) {
        return decodeURIComponent(trimmed.slice(SVG_UTF8_PREFIX.length));
    }

    if (trimmed.startsWith(SVG_BASE64_PREFIX)) {
        return decodeBase64(trimmed.slice(SVG_BASE64_PREFIX.length));
    }

    return trimmed;
}

export function ensureRenderableSvgMarkup(
    raw: string,
    fallbackDimensions: { width: number; height: number } = { width: 1280, height: 960 },
) {
    const normalized = normalizeSvgExport(raw);
    if (!normalized.startsWith('<svg')) {
        return normalized;
    }

    const width = parseSvgDimension(parseSvgAttribute(normalized, 'width'));
    const height = parseSvgDimension(parseSvgAttribute(normalized, 'height'));
    const resolvedWidth = width && width > 0 ? width : fallbackDimensions.width;
    const resolvedHeight = height && height > 0
        ? height
        : Math.max(1, Math.round(resolvedWidth * (fallbackDimensions.height / fallbackDimensions.width)));

    let nextMarkup = normalized;
    if (!width || width <= 0) {
        nextMarkup = replaceSvgAttribute(nextMarkup, 'width', String(Math.round(resolvedWidth)));
    }
    if (!height || height <= 0) {
        nextMarkup = replaceSvgAttribute(nextMarkup, 'height', String(Math.round(resolvedHeight)));
    }

    return nextMarkup;
}

export function scaleSvgMarkupDisplay(raw: string, factor: number) {
    const normalized = ensureRenderableSvgMarkup(raw);
    if (!normalized.startsWith('<svg')) {
        return normalized;
    }

    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const width = parseSvgDimension(parseSvgAttribute(normalized, 'width'));
    const height = parseSvgDimension(parseSvgAttribute(normalized, 'height'));

    if (!width || !height) {
        return normalized;
    }

    let nextMarkup = normalized;
    nextMarkup = replaceSvgAttribute(nextMarkup, 'width', String(Math.max(1, Math.round(width * safeFactor))));
    nextMarkup = replaceSvgAttribute(nextMarkup, 'height', String(Math.max(1, Math.round(height * safeFactor))));

    return nextMarkup;
}

export function getRenderableSvgDimensions(
    raw: string,
    fallbackDimensions: { width: number; height: number } = { width: 1280, height: 960 },
) {
    const normalized = ensureRenderableSvgMarkup(raw, fallbackDimensions);
    if (!normalized.startsWith('<svg')) {
        return null;
    }

    const viewBox = parseSvgViewBox(normalized);
    const width = parseSvgDimension(parseSvgAttribute(normalized, 'width')) ?? viewBox?.width ?? fallbackDimensions.width;
    const height = parseSvgDimension(parseSvgAttribute(normalized, 'height')) ?? viewBox?.height ?? fallbackDimensions.height;

    if (!width || !height || width <= 0 || height <= 0) {
        return null;
    }

    return { width, height };
}

export function isRenderableSvgMarkup(raw: string) {
    const normalized = normalizeSvgExport(raw);
    if (!normalized.startsWith('<svg')) {
        return false;
    }

    const width = parseSvgDimension(parseSvgAttribute(normalized, 'width'));
    const height = parseSvgDimension(parseSvgAttribute(normalized, 'height'));

    return Boolean(width && width > 0 && height && height > 0);
}
