import { getRenderableSvgDimensions, normalizeSvgExport } from '@/lib/problem-svg';
import type { ProblemFigureDisplay } from '@/lib/structured-problem';

export const PROBLEM_FIGURE_DEFAULT_ASPECT_RATIO = 4 / 3;
export const PROBLEM_FIGURE_DEFAULT_ZOOM = 1;
export const PROBLEM_FIGURE_MIN_ZOOM = 0.25;
export const PROBLEM_FIGURE_MAX_ZOOM = 3;
export const DEFAULT_PROBLEM_FIGURE_DISPLAY: ProblemFigureDisplay = {
    zoom: PROBLEM_FIGURE_DEFAULT_ZOOM,
    panX: 0,
    panY: 0,
};

type ProblemFigureAssetLike = {
    kind?: string | null;
    mimeType?: string | null;
    inlineContent?: string | null;
    width?: number | null;
    height?: number | null;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function normalizeProblemFigureDisplay(display?: Partial<ProblemFigureDisplay> | null): ProblemFigureDisplay {
    const zoom = Number.isFinite(display?.zoom)
        ? clamp(display?.zoom ?? PROBLEM_FIGURE_MIN_ZOOM, PROBLEM_FIGURE_MIN_ZOOM, PROBLEM_FIGURE_MAX_ZOOM)
        : PROBLEM_FIGURE_DEFAULT_ZOOM;
    const panX = Math.abs(zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 && Number.isFinite(display?.panX)
        ? clamp(display?.panX ?? 0, -1, 1)
        : 0;
    const panY = Math.abs(zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 && Number.isFinite(display?.panY)
        ? clamp(display?.panY ?? 0, -1, 1)
        : 0;

    return { zoom, panX, panY };
}

export function shouldPersistProblemFigureDisplay(display?: Partial<ProblemFigureDisplay> | null) {
    const normalized = normalizeProblemFigureDisplay(display);
    return Math.abs(normalized.zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001
        || Math.abs(normalized.panX) > 0.0001
        || Math.abs(normalized.panY) > 0.0001;
}

export function getProblemFigureShiftPercent(display?: Partial<ProblemFigureDisplay> | null) {
    const normalized = normalizeProblemFigureDisplay(display);
    const maxShiftPercent = Math.abs(normalized.zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) * 50;

    return {
        x: normalized.panX * maxShiftPercent,
        y: normalized.panY * maxShiftPercent,
    };
}

export function resolveProblemFigureAspectRatio(
    asset?: ProblemFigureAssetLike | null,
    fallbackAspectRatio = PROBLEM_FIGURE_DEFAULT_ASPECT_RATIO,
) {
    if (asset?.width && asset.width > 0 && asset.height && asset.height > 0) {
        return asset.width / asset.height;
    }

    const inlineContent = asset?.inlineContent?.trim();
    const normalizedSvg = normalizeSvgExport(inlineContent ?? '');
    const isSvg = asset?.kind === 'SVG'
        || asset?.mimeType === 'image/svg+xml'
        || normalizedSvg.startsWith('<svg');

    if (isSvg && inlineContent) {
        const dimensions = getRenderableSvgDimensions(inlineContent);
        if (dimensions) {
            return dimensions.width / dimensions.height;
        }
    }

    return fallbackAspectRatio;
}
