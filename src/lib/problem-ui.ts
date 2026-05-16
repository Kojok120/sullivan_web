export type ProblemEditorViewMode = 'admin' | 'author';

type Option<T extends string> = {
    value: T;
    labelKey: string;
    descriptionKey?: string;
};

export const PROBLEM_TYPE_OPTIONS = [
    { value: 'SHORT_TEXT', labelKey: 'problemType.SHORT_TEXT', descriptionKey: 'problemTypeDescription.SHORT_TEXT' },
    { value: 'GRAPH_DRAW', labelKey: 'problemType.GRAPH_DRAW', descriptionKey: 'problemTypeDescription.GRAPH_DRAW' },
    { value: 'GEOMETRY', labelKey: 'problemType.GEOMETRY', descriptionKey: 'problemTypeDescription.GEOMETRY' },
] as const satisfies ReadonlyArray<Option<string>>;

export const PROBLEM_TYPE_VALUES = PROBLEM_TYPE_OPTIONS.map((option) => option.value);

export const PROBLEM_STATUS_OPTIONS = [
    { value: 'DRAFT', labelKey: 'status.DRAFT' },
    { value: 'PUBLISHED', labelKey: 'status.PUBLISHED' },
    { value: 'SENT_BACK', labelKey: 'status.SENT_BACK' },
] as const satisfies ReadonlyArray<Option<string>>;

export const PROBLEM_STATUS_VALUES = PROBLEM_STATUS_OPTIONS.map((option) => option.value);

export type ProblemStatusValue = (typeof PROBLEM_STATUS_OPTIONS)[number]['value'];

export const PROBLEM_AUTHORING_TOOL_OPTIONS = [
    { value: 'MANUAL', labelKey: 'authoringTool.MANUAL' },
    { value: 'SVG', labelKey: 'authoringTool.SVG' },
    { value: 'UPLOAD', labelKey: 'authoringTool.UPLOAD' },
] as const satisfies ReadonlyArray<Option<string>>;

export const BLOCK_TYPE_OPTIONS = [
    { value: 'paragraph', labelKey: 'blockType.paragraph' },
    { value: 'katexInline', labelKey: 'blockType.katexInline' },
    { value: 'katexDisplay', labelKey: 'blockType.katexDisplay' },
    { value: 'image', labelKey: 'blockType.image' },
    { value: 'svg', labelKey: 'blockType.svg' },
    { value: 'table', labelKey: 'blockType.table' },
    { value: 'choices', labelKey: 'blockType.choices' },
    { value: 'blankGroup', labelKey: 'blockType.blankGroup' },
] as const satisfies ReadonlyArray<Option<string>>;

export const ASSET_KIND_OPTIONS = [
    { value: 'IMAGE', labelKey: 'assetKind.IMAGE' },
    { value: 'SVG', labelKey: 'assetKind.SVG' },
    { value: 'PDF', labelKey: 'assetKind.PDF' },
    { value: 'JSON', labelKey: 'assetKind.JSON' },
    { value: 'THUMBNAIL', labelKey: 'assetKind.THUMBNAIL' },
] as const satisfies ReadonlyArray<Option<string>>;

export const ASSET_SOURCE_TOOL_OPTIONS = [
    { value: 'MANUAL', labelKey: 'assetSourceTool.MANUAL' },
    { value: 'SVG', labelKey: 'assetSourceTool.SVG' },
    { value: 'UPLOAD', labelKey: 'assetSourceTool.UPLOAD' },
] as const satisfies ReadonlyArray<Option<string>>;

export const VIDEO_STATUS_OPTIONS = [
    { value: 'NONE', labelKey: 'videoStatus.NONE' },
    { value: 'SHOT', labelKey: 'videoStatus.SHOT' },
    { value: 'UPLOADED', labelKey: 'videoStatus.UPLOADED' },
    { value: 'CONFIGURED', labelKey: 'videoStatus.CONFIGURED' },
] as const satisfies ReadonlyArray<Option<string>>;

export const VIDEO_STATUS_VALUES = VIDEO_STATUS_OPTIONS.map((option) => option.value);

export type VideoStatusValue = (typeof VIDEO_STATUS_OPTIONS)[number]['value'];

function getOptionLabel(options: ReadonlyArray<Option<string>>, value: string | null | undefined, fallback = '-'): string {
    if (!value) return fallback;
    return options.find((option) => option.value === value)?.labelKey ?? value;
}

export function getProblemTypeLabel(value: string | null | undefined) {
    return getOptionLabel(PROBLEM_TYPE_OPTIONS, value);
}

export function getProblemStatusLabel(value: string | null | undefined) {
    return getOptionLabel(PROBLEM_STATUS_OPTIONS, value);
}

export function getAuthoringToolLabel(value: string | null | undefined) {
    return getOptionLabel(PROBLEM_AUTHORING_TOOL_OPTIONS, value);
}

export function getBlockTypeLabel(value: string | null | undefined) {
    return getOptionLabel(BLOCK_TYPE_OPTIONS, value);
}

export function getAssetKindLabel(value: string | null | undefined) {
    return getOptionLabel(ASSET_KIND_OPTIONS, value);
}

export function getAssetSourceToolLabel(value: string | null | undefined) {
    return getOptionLabel(ASSET_SOURCE_TOOL_OPTIONS, value);
}

export function getVideoStatusLabel(value: string | null | undefined) {
    return getOptionLabel(VIDEO_STATUS_OPTIONS, value);
}

export function isVideoStatusValue(value: unknown): value is VideoStatusValue {
    return typeof value === 'string' && (VIDEO_STATUS_VALUES as readonly string[]).includes(value);
}

export function isProblemStatusValue(value: unknown): value is ProblemStatusValue {
    return typeof value === 'string' && (PROBLEM_STATUS_VALUES as readonly string[]).includes(value);
}

export function resolveVideoStatusFromUrl(
    desiredStatus: VideoStatusValue | undefined,
    videoUrl: string | null | undefined,
): VideoStatusValue {
    const hasUrl = typeof videoUrl === 'string' && videoUrl.trim() !== '';
    if (hasUrl) return 'CONFIGURED';
    if (!desiredStatus) return 'NONE';
    if (desiredStatus === 'CONFIGURED') return 'UPLOADED';
    return desiredStatus;
}

export function getAvailableAuthoringTools(_problemType: string) {
    return ['MANUAL', 'UPLOAD'] as const;
}
