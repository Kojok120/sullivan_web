export type ProblemEditorViewMode = 'admin' | 'author';

type Option<T extends string> = {
    value: T;
    label: string;
    description?: string;
};

export const PROBLEM_TYPE_OPTIONS = [
    { value: 'SHORT_TEXT', label: '短い記述', description: '語句や短文で答える問題です。' },
    { value: 'GRAPH_DRAW', label: '関数・グラフ', description: '関数や座標平面のグラフを扱う問題です。' },
    { value: 'GEOMETRY', label: '図形', description: '作図や図形の性質を扱う問題です。' },
] as const satisfies ReadonlyArray<Option<string>>;

export const PROBLEM_TYPE_VALUES = PROBLEM_TYPE_OPTIONS.map((option) => option.value);

export const PROBLEM_STATUS_OPTIONS = [
    { value: 'DRAFT', label: '下書き' },
    { value: 'PUBLISHED', label: '公開中' },
    { value: 'ARCHIVED', label: '保管' },
] as const satisfies ReadonlyArray<Option<string>>;

export const CONTENT_FORMAT_OPTIONS = [
    { value: 'PLAIN_TEXT', label: '通常テキスト' },
    { value: 'STRUCTURED_V1', label: '教材レイアウト' },
] as const satisfies ReadonlyArray<Option<string>>;

export const PROBLEM_AUTHORING_TOOL_OPTIONS = [
    { value: 'MANUAL', label: '手入力' },
    { value: 'GEOGEBRA', label: 'GeoGebra' },
    { value: 'SVG', label: 'SVG図版' },
    { value: 'UPLOAD', label: 'ファイル取込' },
] as const satisfies ReadonlyArray<Option<string>>;

export const BLOCK_TYPE_OPTIONS = [
    { value: 'paragraph', label: '説明文' },
    { value: 'katexInline', label: '数式（文中）' },
    { value: 'katexDisplay', label: '数式（独立）' },
    { value: 'image', label: '図・画像' },
    { value: 'svg', label: 'SVG図版' },
    { value: 'table', label: '表' },
    { value: 'choices', label: '選択肢' },
    { value: 'blankGroup', label: '空欄' },
    { value: 'graphAsset', label: 'グラフ図版' },
    { value: 'geometryAsset', label: '図形図版' },
] as const satisfies ReadonlyArray<Option<string>>;

export const ASSET_KIND_OPTIONS = [
    { value: 'IMAGE', label: '画像' },
    { value: 'SVG', label: 'SVG図版' },
    { value: 'PDF', label: 'PDF' },
    { value: 'GEOGEBRA_STATE', label: 'GeoGebra状態' },
    { value: 'JSON', label: 'JSON' },
    { value: 'THUMBNAIL', label: 'サムネイル' },
] as const satisfies ReadonlyArray<Option<string>>;

export const ASSET_SOURCE_TOOL_OPTIONS = [
    { value: 'MANUAL', label: '手入力' },
    { value: 'GEOGEBRA', label: 'GeoGebra' },
    { value: 'SVG', label: 'SVG図版' },
    { value: 'UPLOAD', label: 'ファイル取込' },
] as const satisfies ReadonlyArray<Option<string>>;

export const VIDEO_STATUS_OPTIONS = [
    { value: 'NONE', label: '-' },
    { value: 'SHOT', label: '撮影完了' },
    { value: 'UPLOADED', label: 'Drive完了' },
    { value: 'CONFIGURED', label: '設定済み' },
] as const satisfies ReadonlyArray<Option<string>>;

export const VIDEO_STATUS_VALUES = VIDEO_STATUS_OPTIONS.map((option) => option.value);

export type VideoStatusValue = (typeof VIDEO_STATUS_OPTIONS)[number]['value'];

function getOptionLabel(options: ReadonlyArray<Option<string>>, value: string | null | undefined, fallback = '-'): string {
    if (!value) return fallback;
    return options.find((option) => option.value === value)?.label ?? value;
}

export function getProblemTypeLabel(value: string | null | undefined) {
    return getOptionLabel(PROBLEM_TYPE_OPTIONS, value);
}

export function getProblemStatusLabel(value: string | null | undefined) {
    return getOptionLabel(PROBLEM_STATUS_OPTIONS, value);
}

export function getContentFormatLabel(value: string | null | undefined) {
    return getOptionLabel(CONTENT_FORMAT_OPTIONS, value);
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

export function getAvailableAuthoringTools(problemType: string) {
    if (problemType === 'GRAPH_DRAW' || problemType === 'GEOMETRY') {
        return ['GEOGEBRA', 'SVG'] as const;
    }

    return ['MANUAL', 'UPLOAD'] as const;
}
