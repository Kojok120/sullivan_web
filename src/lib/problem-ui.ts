export type ProblemEditorViewMode = 'admin' | 'author';

type Option<T extends string> = {
    value: T;
    label: string;
    description?: string;
};

export const PROBLEM_TYPE_OPTIONS = [
    { value: 'SHORT_TEXT', label: '短い記述', description: '語句や短文で答える問題です。' },
    { value: 'NUMERIC', label: '数値回答', description: '数字や単位付きの答えを入力する問題です。' },
    { value: 'MULTIPLE_CHOICE', label: '選択問題', description: '選択肢から答えを選ぶ問題です。' },
    { value: 'MULTI_BLANK', label: '空欄補充', description: '複数の空欄に答えを入れる問題です。' },
    { value: 'FORMULA_FINAL', label: '式の回答', description: '数式や化学式などを答える問題です。' },
    { value: 'TABLE_FILL', label: '表の問題', description: '表を読み取ったり埋めたりする問題です。' },
    { value: 'GRAPH_READ', label: 'グラフ読解', description: 'グラフから値や傾向を読み取る問題です。' },
    { value: 'GRAPH_DRAW', label: '関数・グラフ', description: '関数や座標平面のグラフを扱う問題です。' },
    { value: 'GEOMETRY', label: '図形', description: '作図や図形の性質を扱う問題です。' },
    { value: 'DIAGRAM_LABEL', label: '図のラベル', description: '図や模式図に名称を書き込む問題です。' },
    { value: 'SHORT_EXPLANATION', label: '説明記述', description: '理由や考え方を文章で説明する問題です。' },
    { value: 'SCIENCE_EXPERIMENT', label: '理科実験', description: '実験・観察・考察を扱う問題です。' },
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

export const ANSWER_KIND_OPTIONS = [
    { value: 'exact', label: '記述一致' },
    { value: 'numeric', label: '数値判定' },
    { value: 'choice', label: '選択肢判定' },
    { value: 'multiBlank', label: '空欄ごとの判定' },
    { value: 'formula', label: '式の判定' },
    { value: 'rubric', label: '記述評価' },
    { value: 'visionRubric', label: '図や記述の評価' },
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

export function getAnswerKindLabel(value: string | null | undefined) {
    return getOptionLabel(ANSWER_KIND_OPTIONS, value);
}

export function getAssetKindLabel(value: string | null | undefined) {
    return getOptionLabel(ASSET_KIND_OPTIONS, value);
}

export function getAssetSourceToolLabel(value: string | null | undefined) {
    return getOptionLabel(ASSET_SOURCE_TOOL_OPTIONS, value);
}

export function getAvailableAuthoringTools(problemType: string) {
    if (problemType === 'GRAPH_DRAW' || problemType === 'GEOMETRY') {
        return ['GEOGEBRA', 'SVG'] as const;
    }

    return ['MANUAL', 'SVG', 'UPLOAD'] as const;
}
