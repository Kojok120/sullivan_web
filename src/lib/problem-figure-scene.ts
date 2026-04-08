import { z } from 'zod';

export const FIGURE_GENERATION_TARGETS = ['GEOGEBRA', 'SVG'] as const;

export const figureGenerationTargetSchema = z.enum(FIGURE_GENERATION_TARGETS);

const viewportSchema = z.object({
    xmin: z.number(),
    xmax: z.number(),
    ymin: z.number(),
    ymax: z.number(),
});

const trimmedNonEmptyStringSchema = z.string().trim().min(1);

const optionalTrimmedNonEmptyStringSchema = z.preprocess((value) => {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}, trimmedNonEmptyStringSchema.optional());

const desmosExpressionSchema = z.object({
    id: z.string().min(1).optional(),
    latex: trimmedNonEmptyStringSchema,
    color: trimmedNonEmptyStringSchema.optional(),
    hidden: z.boolean().optional(),
    points: z.boolean().optional(),
    lines: z.boolean().optional(),
    lineStyle: z.enum(['SOLID', 'DASHED']).optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    label: optionalTrimmedNonEmptyStringSchema,
});

const desmosPointSchema = z.object({
    id: trimmedNonEmptyStringSchema,
    x: z.number(),
    y: z.number(),
    label: optionalTrimmedNonEmptyStringSchema,
    color: trimmedNonEmptyStringSchema.optional(),
    showLabel: z.boolean().optional(),
    draggable: z.boolean().optional(),
});

const desmosStyleSchema = z.object({
    showGrid: z.boolean().optional(),
    showAxes: z.boolean().optional(),
});

export const desmosSceneSpecSchema = z.object({
    kind: z.literal('desmos'),
    viewport: viewportSchema,
    expressions: z.array(desmosExpressionSchema).default([]),
    points: z.array(desmosPointSchema).default([]),
    notes: z.array(z.string()).default([]),
    style: desmosStyleSchema.default({}),
});

const geoPointObjectSchema = z.object({
    type: z.literal('point'),
    name: trimmedNonEmptyStringSchema,
    x: z.number(),
    y: z.number(),
});

const geoSegmentObjectSchema = z.object({
    type: z.literal('segment'),
    name: trimmedNonEmptyStringSchema,
    from: trimmedNonEmptyStringSchema,
    to: trimmedNonEmptyStringSchema,
});

const geoLineObjectSchema = z.object({
    type: z.literal('line'),
    name: trimmedNonEmptyStringSchema,
    through: z.tuple([trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema]),
});

const geoFunctionObjectSchema = z.object({
    type: z.literal('function'),
    name: trimmedNonEmptyStringSchema,
    expression: trimmedNonEmptyStringSchema,
});

const geoCircleObjectSchema = z.object({
    type: z.literal('circle'),
    name: trimmedNonEmptyStringSchema,
    center: trimmedNonEmptyStringSchema,
    through: trimmedNonEmptyStringSchema.optional(),
    radius: z.number().positive().optional(),
});

const geoPolygonObjectSchema = z.object({
    type: z.literal('polygon'),
    name: trimmedNonEmptyStringSchema,
    points: z.array(trimmedNonEmptyStringSchema).min(3),
});

const geoAngleObjectSchema = z.object({
    type: z.literal('angle'),
    name: trimmedNonEmptyStringSchema,
    points: z.tuple([trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema]),
});

const geoTextObjectSchema = z.object({
    type: z.literal('text'),
    name: trimmedNonEmptyStringSchema,
    text: trimmedNonEmptyStringSchema,
    x: z.number(),
    y: z.number(),
});

const geoObjectSchema = z.discriminatedUnion('type', [
    geoPointObjectSchema,
    geoSegmentObjectSchema,
    geoLineObjectSchema,
    geoFunctionObjectSchema,
    geoCircleObjectSchema,
    geoPolygonObjectSchema,
    geoAngleObjectSchema,
    geoTextObjectSchema,
]);

const geoConstraintSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('perpendicular'),
        name: trimmedNonEmptyStringSchema,
        baseLine: z.tuple([trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema]),
        through: trimmedNonEmptyStringSchema,
    }),
    z.object({
        type: z.literal('parallel'),
        name: trimmedNonEmptyStringSchema,
        baseLine: z.tuple([trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema]),
        through: trimmedNonEmptyStringSchema,
    }),
    z.object({
        type: z.literal('midpoint'),
        name: trimmedNonEmptyStringSchema,
        of: z.tuple([trimmedNonEmptyStringSchema, trimmedNonEmptyStringSchema]),
    }),
]);

const geoLabelSchema = z.object({
    target: trimmedNonEmptyStringSchema,
    text: optionalTrimmedNonEmptyStringSchema,
    visible: z.boolean().default(true),
});

const geoStyleSchema = z.object({
    showGrid: z.boolean().optional(),
    showAxes: z.boolean().optional(),
});

export const geoGebraSceneSpecSchema = z.object({
    kind: z.literal('geogebra'),
    viewport: viewportSchema,
    objects: z.array(geoObjectSchema).min(1),
    constraints: z.array(geoConstraintSchema).default([]),
    labels: z.array(geoLabelSchema).default([]),
    style: geoStyleSchema.default({}),
});

const svgPointSchema = z.object({
    x: z.number(),
    y: z.number(),
});

const svgLineElementSchema = z.object({
    type: z.literal('line'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    dashed: z.boolean().optional(),
});

const svgCircleElementSchema = z.object({
    type: z.literal('circle'),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    fill: z.string().optional(),
});

const svgRectElementSchema = z.object({
    type: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    fill: z.string().optional(),
});

const svgPolylineElementSchema = z.object({
    type: z.literal('polyline'),
    points: z.array(svgPointSchema).min(2),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    dashed: z.boolean().optional(),
    fill: z.string().optional(),
});

const svgPolygonElementSchema = z.object({
    type: z.literal('polygon'),
    points: z.array(svgPointSchema).min(3),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    fill: z.string().optional(),
});

const svgPathElementSchema = z.object({
    type: z.literal('path'),
    d: z.string().min(1),
    stroke: z.string().optional(),
    strokeWidth: z.number().positive().optional(),
    fill: z.string().optional(),
    dashed: z.boolean().optional(),
});

const svgTextElementSchema = z.object({
    type: z.literal('text'),
    x: z.number(),
    y: z.number(),
    text: trimmedNonEmptyStringSchema,
    fill: trimmedNonEmptyStringSchema.optional(),
    fontSize: z.number().positive().optional(),
    textAnchor: z.enum(['start', 'middle', 'end']).optional(),
});

const svgElementSchema = z.discriminatedUnion('type', [
    svgLineElementSchema,
    svgCircleElementSchema,
    svgRectElementSchema,
    svgPolylineElementSchema,
    svgPolygonElementSchema,
    svgPathElementSchema,
    svgTextElementSchema,
]);

const svgLabelSchema = z.object({
    x: z.number(),
    y: z.number(),
    text: trimmedNonEmptyStringSchema,
    fill: trimmedNonEmptyStringSchema.optional(),
    fontSize: z.number().positive().optional(),
    textAnchor: z.enum(['start', 'middle', 'end']).optional(),
});

export const svgSceneSpecSchema = z.object({
    kind: z.literal('svg'),
    width: z.number().int().positive().max(2400),
    height: z.number().int().positive().max(2400),
    elements: z.array(svgElementSchema).min(1),
    labels: z.array(svgLabelSchema).default([]),
    caption: z.string().optional(),
    background: z.string().optional(),
});

export const sceneSpecSchema = z.discriminatedUnion('kind', [
    geoGebraSceneSpecSchema,
    svgSceneSpecSchema,
]);

export const problemFigureGenerationContextSchema = z.object({
    sourceProblemText: z.string().default(''),
    extraPrompt: z.string().default(''),
    targetTool: figureGenerationTargetSchema,
    modelName: z.string().min(1),
    generatedAt: z.string().min(1),
    sceneSpecKind: z.enum(['geogebra', 'svg']),
    sceneSpecDigest: z.string().min(1),
});

export type FigureGenerationTarget = z.infer<typeof figureGenerationTargetSchema>;
export type DesmosSceneSpec = z.infer<typeof desmosSceneSpecSchema>;
export type GeoGebraSceneSpec = z.infer<typeof geoGebraSceneSpecSchema>;
export type SvgSceneSpec = z.infer<typeof svgSceneSpecSchema>;
export type ProblemFigureSceneSpec = z.infer<typeof sceneSpecSchema>;
export type ProblemFigureGenerationContext = z.infer<typeof problemFigureGenerationContextSchema>;

type JsonSchema = Record<string, unknown>;

const viewportJsonSchema: JsonSchema = {
    type: 'object',
    properties: {
        xmin: { type: 'number' },
        xmax: { type: 'number' },
        ymin: { type: 'number' },
        ymax: { type: 'number' },
    },
    required: ['xmin', 'xmax', 'ymin', 'ymax'],
    additionalProperties: false,
};

export const desmosSceneSpecJsonSchema: JsonSchema = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: ['desmos'] },
        viewport: viewportJsonSchema,
        expressions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    latex: { type: 'string' },
                    color: { type: 'string' },
                    hidden: { type: 'boolean' },
                    points: { type: 'boolean' },
                    lines: { type: 'boolean' },
                    lineStyle: { type: 'string', enum: ['SOLID', 'DASHED'] },
                    fillOpacity: { type: 'number' },
                    label: { type: 'string' },
                },
                required: ['latex'],
                additionalProperties: false,
            },
        },
        points: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    label: { type: 'string' },
                    color: { type: 'string' },
                    showLabel: { type: 'boolean' },
                    draggable: { type: 'boolean' },
                },
                required: ['id', 'x', 'y'],
                additionalProperties: false,
            },
        },
        notes: {
            type: 'array',
            items: { type: 'string' },
        },
        style: {
            type: 'object',
            properties: {
                showGrid: { type: 'boolean' },
                showAxes: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    required: ['kind', 'viewport', 'expressions', 'points', 'notes', 'style'],
    additionalProperties: false,
};

export const geoGebraSceneSpecJsonSchema: JsonSchema = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: ['geogebra'] },
        viewport: viewportJsonSchema,
        objects: {
            type: 'array',
            items: {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['point'] },
                            name: { type: 'string' },
                            x: { type: 'number' },
                            y: { type: 'number' },
                        },
                        required: ['type', 'name', 'x', 'y'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['segment'] },
                            name: { type: 'string' },
                            from: { type: 'string' },
                            to: { type: 'string' },
                        },
                        required: ['type', 'name', 'from', 'to'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['line'] },
                            name: { type: 'string' },
                            through: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 2,
                                maxItems: 2,
                            },
                        },
                        required: ['type', 'name', 'through'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['function'] },
                            name: { type: 'string' },
                            expression: { type: 'string' },
                        },
                        required: ['type', 'name', 'expression'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['circle'] },
                            name: { type: 'string' },
                            center: { type: 'string' },
                            through: { type: 'string' },
                            radius: { type: 'number' },
                        },
                        required: ['type', 'name', 'center'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['polygon'] },
                            name: { type: 'string' },
                            points: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 3,
                            },
                        },
                        required: ['type', 'name', 'points'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['angle'] },
                            name: { type: 'string' },
                            points: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 3,
                                maxItems: 3,
                            },
                        },
                        required: ['type', 'name', 'points'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['text'] },
                            name: { type: 'string' },
                            text: { type: 'string' },
                            x: { type: 'number' },
                            y: { type: 'number' },
                        },
                        required: ['type', 'name', 'text', 'x', 'y'],
                        additionalProperties: false,
                    },
                ],
            },
        },
        constraints: {
            type: 'array',
            items: {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['perpendicular'] },
                            name: { type: 'string' },
                            baseLine: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 2,
                                maxItems: 2,
                            },
                            through: { type: 'string' },
                        },
                        required: ['type', 'name', 'baseLine', 'through'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['parallel'] },
                            name: { type: 'string' },
                            baseLine: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 2,
                                maxItems: 2,
                            },
                            through: { type: 'string' },
                        },
                        required: ['type', 'name', 'baseLine', 'through'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['midpoint'] },
                            name: { type: 'string' },
                            of: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 2,
                                maxItems: 2,
                            },
                        },
                        required: ['type', 'name', 'of'],
                        additionalProperties: false,
                    },
                ],
            },
        },
        labels: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    target: { type: 'string' },
                    text: { type: 'string' },
                    visible: { type: 'boolean' },
                },
                required: ['target', 'visible'],
                additionalProperties: false,
            },
        },
        style: {
            type: 'object',
            properties: {
                showGrid: { type: 'boolean' },
                showAxes: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    required: ['kind', 'viewport', 'objects', 'constraints', 'labels', 'style'],
    additionalProperties: false,
};

export const svgSceneSpecJsonSchema: JsonSchema = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: ['svg'] },
        width: { type: 'integer' },
        height: { type: 'integer' },
        elements: {
            type: 'array',
            items: {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['line'] },
                            x1: { type: 'number' },
                            y1: { type: 'number' },
                            x2: { type: 'number' },
                            y2: { type: 'number' },
                            stroke: { type: 'string' },
                            strokeWidth: { type: 'number' },
                            dashed: { type: 'boolean' },
                        },
                        required: ['type', 'x1', 'y1', 'x2', 'y2'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['circle'] },
                            cx: { type: 'number' },
                            cy: { type: 'number' },
                            r: { type: 'number' },
                            stroke: { type: 'string' },
                            strokeWidth: { type: 'number' },
                            fill: { type: 'string' },
                        },
                        required: ['type', 'cx', 'cy', 'r'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['rect'] },
                            x: { type: 'number' },
                            y: { type: 'number' },
                            width: { type: 'number' },
                            height: { type: 'number' },
                            stroke: { type: 'string' },
                            strokeWidth: { type: 'number' },
                            fill: { type: 'string' },
                        },
                        required: ['type', 'x', 'y', 'width', 'height'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['polyline', 'polygon'] },
                            points: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        x: { type: 'number' },
                                        y: { type: 'number' },
                                    },
                                    required: ['x', 'y'],
                                    additionalProperties: false,
                                },
                            },
                            stroke: { type: 'string' },
                            strokeWidth: { type: 'number' },
                            dashed: { type: 'boolean' },
                            fill: { type: 'string' },
                        },
                        required: ['type', 'points'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['path'] },
                            d: { type: 'string' },
                            stroke: { type: 'string' },
                            strokeWidth: { type: 'number' },
                            fill: { type: 'string' },
                            dashed: { type: 'boolean' },
                        },
                        required: ['type', 'd'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['text'] },
                            x: { type: 'number' },
                            y: { type: 'number' },
                            text: { type: 'string' },
                            fill: { type: 'string' },
                            fontSize: { type: 'number' },
                            textAnchor: { type: 'string', enum: ['start', 'middle', 'end'] },
                        },
                        required: ['type', 'x', 'y', 'text'],
                        additionalProperties: false,
                    },
                ],
            },
        },
        labels: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    text: { type: 'string' },
                    fill: { type: 'string' },
                    fontSize: { type: 'number' },
                    textAnchor: { type: 'string', enum: ['start', 'middle', 'end'] },
                },
                required: ['x', 'y', 'text'],
                additionalProperties: false,
            },
        },
        caption: { type: 'string' },
        background: { type: 'string' },
    },
    required: ['kind', 'width', 'height', 'elements', 'labels'],
    additionalProperties: false,
};

export function getSceneSpecJsonSchema(targetTool: FigureGenerationTarget): JsonSchema {
    switch (targetTool) {
        case 'GEOGEBRA':
            return geoGebraSceneSpecJsonSchema;
        case 'SVG':
            return svgSceneSpecJsonSchema;
    }
}

export function parseSceneSpecForTarget(targetTool: FigureGenerationTarget, raw: unknown) {
    switch (targetTool) {
        case 'GEOGEBRA':
            return geoGebraSceneSpecSchema.parse(raw);
        case 'SVG':
            return svgSceneSpecSchema.parse(raw);
    }
}

export function parseProblemFigureGenerationContext(raw: unknown): ProblemFigureGenerationContext | null {
    const result = problemFigureGenerationContextSchema.safeParse(raw);
    return result.success ? result.data : null;
}

export function isAiFigureGenerationSupported(problemType: string): boolean {
    return problemType === 'GEOMETRY' || problemType === 'GRAPH_DRAW';
}

export function getDefaultFigureGenerationTarget(problemType: string): FigureGenerationTarget {
    if (problemType === 'GEOMETRY') return 'GEOGEBRA';
    if (problemType === 'GRAPH_DRAW') return 'GEOGEBRA';
    return 'SVG';
}

export function buildFigureGenerationSourceText(document: {
    version?: number;
    title?: string;
    summary?: string;
    instructions?: string;
    blocks: Array<Record<string, unknown>>;
}): string {
    const sections = [
        document.title?.trim(),
        document.summary?.trim(),
        document.instructions?.trim(),
        ...document.blocks.flatMap((block) => {
            const type = String(block.type ?? '');
            if (type === 'paragraph' || type === 'caption') {
                return [String(block.text ?? '').trim()];
            }
            if (type === 'katexInline' || type === 'katexDisplay') {
                return [String(block.latex ?? '').trim()];
            }
            if (type === 'table') {
                const headers = Array.isArray(block.headers) ? block.headers.map((header) => String(header)) : [];
                const rows = Array.isArray(block.rows)
                    ? block.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell)) : [])
                    : [];
                return [
                    headers.join(' | '),
                    ...rows.map((row) => row.join(' | ')),
                    String(block.caption ?? '').trim(),
                ];
            }
            if (type === 'choices') {
                const options = Array.isArray(block.options) ? block.options : [];
                return options.map((option) => `${String((option as Record<string, unknown>).id ?? '')}: ${String((option as Record<string, unknown>).label ?? '')}`);
            }
            if (type === 'blankGroup') {
                const blanks = Array.isArray(block.blanks) ? block.blanks : [];
                return blanks.map((blank) => `${String((blank as Record<string, unknown>).id ?? '')}: ${String((blank as Record<string, unknown>).label ?? '')}`);
            }
            return [];
        }),
    ]
        .map((section) => section?.trim())
        .filter(Boolean);

    return sections.join('\n').slice(0, 4000);
}

export function buildFigureGenerationPrompt(params: {
    targetTool: FigureGenerationTarget;
    problemType?: string;
    sourceProblemText: string;
    extraPrompt?: string;
}) {
    const common = [
        'あなたは中学校数学の図版生成アシスタントです。',
        '出力は JSON のみです。解説文や Markdown は返さないでください。',
        '問題文そのものや解答仕様は生成せず、図形・グラフ・関数の素材だけを生成してください。',
        '座標や値は、中学生向けに読み取りやすい簡潔な値を優先してください。',
        `問題文:\n${params.sourceProblemText || '(未入力)'}`,
        params.extraPrompt?.trim() ? `追加指示:\n${params.extraPrompt.trim()}` : '',
    ].filter(Boolean);

    if (params.targetTool === 'GEOGEBRA') {
        const graphingGuidance = params.problemType === 'GRAPH_DRAW'
            ? [
            '関数グラフ問題なので、必要なら objects に type:"function" を使ってください。',
            'function.expression には GeoGebra で扱える関数式を入れてください。例: x^2-4x+3。',
            '頂点、切片、交点など読み取らせたい点は point で別に定義してください。',
            'viewport は、グラフの重要点が端で切れないように上下左右へ十分な余白を入れてください。特に頂点や交点が見切れないようにしてください。',
        ]
            : [];

        return [
            ...common,
            'targetTool: GEOGEBRA',
            'kind は "geogebra" に固定してください。',
            'objects は依存順に並べ、先に点、その後に線分・直線・円・多角形などを定義してください。',
            'point / segment / line / function / circle / polygon / angle / text のみを使ってください。',
            'constraints には perpendicular / parallel / midpoint のみを使ってください。',
            '必要なラベルは labels に入れ、target には既存 object 名を指定してください。',
            ...graphingGuidance,
        ].join('\n\n');
    }

    return [
        ...common,
        'targetTool: SVG',
        'kind は "svg" に固定してください。',
        '静的図版だけを生成してください。座標系、放物線、補助線、ラベルは elements と labels に分けてください。',
        'elements には line / circle / rect / polyline / polygon / path / text のみを使ってください。',
        'width と height は 200 以上 1600 以下の整数で指定してください。',
        'path の d は SVG path 文字列として妥当なものにしてください。',
    ].join('\n\n');
}

export function compileDesmosSceneSpec(scene: DesmosSceneSpec) {
    const showGrid = scene.style.showGrid ?? true;
    const showAxes = scene.style.showAxes ?? true;
    const expressions = [
        ...scene.expressions.map((expression, index) => ({
            id: expression.id ?? `expr-${index + 1}`,
            type: 'expression',
            latex: expression.latex,
            color: expression.color,
            hidden: expression.hidden ?? false,
            points: expression.points,
            lines: expression.lines,
            style: expression.lineStyle,
            fillOpacity: expression.fillOpacity,
            label: expression.label,
            showLabel: Boolean(expression.label),
        })),
        ...scene.points.map((point) => ({
            id: point.id,
            type: 'expression',
            latex: `(${point.x},${point.y})`,
            color: point.color,
            label: point.label,
            showLabel: point.showLabel ?? Boolean(point.label),
            dragMode: point.draggable ? 'XY' : 'NONE',
        })),
        ...scene.notes.map((note, index) => ({
            id: `note-${index + 1}`,
            type: 'text',
            text: note,
        })),
    ];

    return {
        state: {
            version: 10,
            randomSeed: '0',
            graph: {
                viewport: scene.viewport,
                showGrid,
                showXAxis: showAxes,
                showYAxis: showAxes,
            },
            expressions: {
                list: expressions,
            },
        },
    };
}

function escapeGeoString(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function compileFunctionEvaluator(expression: string) {
    const sanitized = expression
        .replace(/\s+/g, '')
        .replace(/π/g, 'pi')
        .replace(/\bpi\b/gi, 'Math.PI')
        .replace(/\bln\b/gi, 'Math.log')
        .replace(/\b(log|sqrt|sin|cos|tan|abs|exp)\b/gi, (name) => `Math.${name.toLowerCase()}`)
        .replace(/(\d)(x)/gi, '$1*$2')
        .replace(/(\d)\(/g, '$1*(')
        .replace(/(\d)(Math\.)/g, '$1*$2')
        .replace(/x\(/gi, 'x*(')
        .replace(/\)(x|\d|\()/gi, ')*$1')
        .replace(/\^/g, '**');

    if (!/^[0-9xX+\-*/().,A-Za-z_*]*$/.test(sanitized)) {
        return null;
    }

    try {
        const evaluate = new Function('x', `return ${sanitized};`) as (x: number) => number;
        return (x: number) => {
            const value = evaluate(x);
            return Number.isFinite(value) ? value : null;
        };
    } catch {
        return null;
    }
}

function expandViewportForScene(scene: GeoGebraSceneSpec) {
    const pointMap = new Map(
        scene.objects
            .filter((object): object is Extract<GeoGebraSceneSpec['objects'][number], { type: 'point' }> => object.type === 'point')
            .map((point) => [point.name, point]),
    );

    const xs: number[] = [scene.viewport.xmin, scene.viewport.xmax];
    const ys: number[] = [scene.viewport.ymin, scene.viewport.ymax];

    const addPoint = (x: number, y: number) => {
        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    };

    for (const object of scene.objects) {
        switch (object.type) {
            case 'point':
                addPoint(object.x, object.y);
                break;
            case 'text':
                addPoint(object.x, object.y);
                break;
            case 'circle': {
                const center = pointMap.get(object.center);
                if (!center) break;
                if (object.radius !== undefined) {
                    addPoint(center.x - object.radius, center.y - object.radius);
                    addPoint(center.x + object.radius, center.y + object.radius);
                    break;
                }
                if (object.through) {
                    const through = pointMap.get(object.through);
                    if (!through) break;
                    const radius = Math.hypot(through.x - center.x, through.y - center.y);
                    addPoint(center.x - radius, center.y - radius);
                    addPoint(center.x + radius, center.y + radius);
                }
                break;
            }
            case 'polygon':
                for (const name of object.points) {
                    const point = pointMap.get(name);
                    if (point) addPoint(point.x, point.y);
                }
                break;
            case 'segment': {
                const from = pointMap.get(object.from);
                const to = pointMap.get(object.to);
                if (from) addPoint(from.x, from.y);
                if (to) addPoint(to.x, to.y);
                break;
            }
            case 'line': {
                const from = pointMap.get(object.through[0]);
                const to = pointMap.get(object.through[1]);
                if (from) addPoint(from.x, from.y);
                if (to) addPoint(to.x, to.y);
                break;
            }
            case 'angle':
                for (const name of object.points) {
                    const point = pointMap.get(name);
                    if (point) addPoint(point.x, point.y);
                }
                break;
            case 'function': {
                const evaluate = compileFunctionEvaluator(object.expression);
                if (!evaluate) break;

                const sampleCount = 96;
                const minX = scene.viewport.xmin;
                const maxX = scene.viewport.xmax;
                const step = (maxX - minX) / sampleCount;
                for (let index = 0; index <= sampleCount; index += 1) {
                    const x = minX + (step * index);
                    const y = evaluate(x);
                    if (y !== null) {
                        addPoint(x, y);
                    }
                }
                break;
            }
        }
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const xPad = Math.max((maxX - minX) * 0.08, 1);
    const yPad = Math.max((maxY - minY) * 0.12, 1);

    return {
        xmin: Math.min(scene.viewport.xmin, minX - xPad),
        xmax: Math.max(scene.viewport.xmax, maxX + xPad),
        ymin: Math.min(scene.viewport.ymin, minY - yPad),
        ymax: Math.max(scene.viewport.ymax, maxY + yPad),
    };
}

export function compileGeoGebraSceneSpec(scene: GeoGebraSceneSpec) {
    const normalizedViewport = expandViewportForScene(scene);
    const commands: string[] = [];
    const labelOperations = scene.labels.map((label) => ({
        target: label.target,
        text: label.text?.trim() || undefined,
        visible: label.visible,
        style: label.text?.trim() ? 3 : 0,
    }));

    for (const object of scene.objects) {
        switch (object.type) {
            case 'point':
                commands.push(`${object.name}=(${object.x}, ${object.y})`);
                break;
            case 'segment':
                commands.push(`${object.name}=Segment(${object.from}, ${object.to})`);
                break;
            case 'line':
                commands.push(`${object.name}=Line(${object.through[0]}, ${object.through[1]})`);
                break;
            case 'function':
                commands.push(`${object.name}(x)=${object.expression}`);
                break;
            case 'circle':
                if (object.radius !== undefined) {
                    commands.push(`${object.name}=Circle(${object.center}, ${object.radius})`);
                } else if (object.through) {
                    commands.push(`${object.name}=Circle(${object.center}, ${object.through})`);
                }
                break;
            case 'polygon':
                commands.push(`${object.name}=Polygon(${object.points.join(', ')})`);
                break;
            case 'angle':
                commands.push(`${object.name}=Angle(${object.points.join(', ')})`);
                break;
            case 'text':
                commands.push(`${object.name}=Text("${escapeGeoString(object.text)}", (${object.x}, ${object.y}))`);
                break;
        }
    }

    for (const constraint of scene.constraints) {
        switch (constraint.type) {
            case 'perpendicular':
                commands.push(`${constraint.name}=PerpendicularLine(${constraint.through}, Line(${constraint.baseLine[0]}, ${constraint.baseLine[1]}))`);
                break;
            case 'parallel':
                commands.push(`${constraint.name}=ParallelLine(${constraint.through}, Line(${constraint.baseLine[0]}, ${constraint.baseLine[1]}))`);
                break;
            case 'midpoint':
                commands.push(`${constraint.name}=Midpoint(${constraint.of[0]}, ${constraint.of[1]})`);
                break;
        }
    }

    return {
        commands,
        labelOperations,
        viewport: normalizedViewport,
        style: {
            showGrid: scene.style.showGrid ?? true,
            showAxes: scene.style.showAxes ?? true,
        },
    };
}

function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSvgStyle(input: {
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    dashed?: boolean;
}) {
    const styleParts = [
        `stroke="${escapeXml(input.stroke ?? '#111827')}"`,
        `stroke-width="${input.strokeWidth ?? 2}"`,
        `fill="${escapeXml(input.fill ?? 'none')}"`,
    ];
    if (input.dashed) {
        styleParts.push('stroke-dasharray="8 6"');
    }

    return styleParts.join(' ');
}

function pointList(points: Array<{ x: number; y: number }>) {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function renderSvgSceneSpec(scene: SvgSceneSpec) {
    const elements = scene.elements.map((element) => {
        switch (element.type) {
            case 'line':
                return `<line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" ${renderSvgStyle(element)} />`;
            case 'circle':
                return `<circle cx="${element.cx}" cy="${element.cy}" r="${element.r}" ${renderSvgStyle(element)} />`;
            case 'rect':
                return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" ${renderSvgStyle(element)} />`;
            case 'polyline':
                return `<polyline points="${pointList(element.points)}" ${renderSvgStyle(element)} />`;
            case 'polygon':
                return `<polygon points="${pointList(element.points)}" ${renderSvgStyle(element)} />`;
            case 'path':
                return `<path d="${escapeXml(element.d)}" ${renderSvgStyle(element)} />`;
            case 'text':
                return `<text x="${element.x}" y="${element.y}" fill="${escapeXml(element.fill ?? '#111827')}" font-size="${element.fontSize ?? 16}" text-anchor="${element.textAnchor ?? 'middle'}">${escapeXml(element.text)}</text>`;
        }
    }).join('\n');

    const labels = scene.labels.map((label) => (
        `<text x="${label.x}" y="${label.y}" fill="${escapeXml(label.fill ?? '#111827')}" font-size="${label.fontSize ?? 16}" text-anchor="${label.textAnchor ?? 'middle'}">${escapeXml(label.text)}</text>`
    )).join('\n');

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="${escapeXml(scene.caption ?? 'AI generated figure')}">`,
        scene.background ? `<rect width="100%" height="100%" fill="${escapeXml(scene.background)}" />` : '',
        elements,
        labels,
        '</svg>',
    ].filter(Boolean).join('\n');
}
