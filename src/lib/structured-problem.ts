import { z } from 'zod';

function createStructuredBlockId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return `block-${Math.random().toString(36).slice(2, 10)}`;
}

const blockBaseSchema = z.object({
    id: z.string().min(1),
});

export const problemFigureDisplaySchema = z.object({
    zoom: z.number().min(0.25).max(3),
    panX: z.number().min(-1).max(1),
    panY: z.number().min(-1).max(1),
});

const paragraphBlockSchema = blockBaseSchema.extend({
    type: z.literal('paragraph'),
    text: z.string().min(1),
});

const katexInlineBlockSchema = blockBaseSchema.extend({
    type: z.literal('katexInline'),
    latex: z.string().min(1),
});

const katexDisplayBlockSchema = blockBaseSchema.extend({
    type: z.literal('katexDisplay'),
    latex: z.string().min(1),
    caption: z.string().optional(),
});

const imageBlockSchema = blockBaseSchema.extend({
    type: z.literal('image'),
    assetId: z.string().optional(),
    src: z.string().optional(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    display: problemFigureDisplaySchema.optional(),
});

const svgBlockSchema = blockBaseSchema.extend({
    type: z.literal('svg'),
    assetId: z.string().optional(),
    svg: z.string().optional(),
    caption: z.string().optional(),
    display: problemFigureDisplaySchema.optional(),
});

const tableBlockSchema = blockBaseSchema.extend({
    type: z.literal('table'),
    headers: z.array(z.string()).default([]),
    rows: z.array(z.array(z.string())).default([]),
    caption: z.string().optional(),
});

const choicesBlockSchema = blockBaseSchema.extend({
    type: z.literal('choices'),
    options: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
    })).min(2),
});

const blankGroupBlockSchema = blockBaseSchema.extend({
    type: z.literal('blankGroup'),
    blanks: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        placeholder: z.string().optional(),
    })).min(1),
});

const graphAssetBlockSchema = blockBaseSchema.extend({
    type: z.literal('graphAsset'),
    assetId: z.string().optional(),
    caption: z.string().optional(),
    display: problemFigureDisplaySchema.optional(),
});

const geometryAssetBlockSchema = blockBaseSchema.extend({
    type: z.literal('geometryAsset'),
    assetId: z.string().optional(),
    caption: z.string().optional(),
    display: problemFigureDisplaySchema.optional(),
});

const answerLinesBlockSchema = blockBaseSchema.extend({
    type: z.literal('answerLines'),
    lines: z.number().int().min(1).max(20).default(3),
});

const captionBlockSchema = blockBaseSchema.extend({
    type: z.literal('caption'),
    text: z.string().min(1),
});

export const problemBlockSchema = z.discriminatedUnion('type', [
    paragraphBlockSchema,
    katexInlineBlockSchema,
    katexDisplayBlockSchema,
    imageBlockSchema,
    svgBlockSchema,
    tableBlockSchema,
    choicesBlockSchema,
    blankGroupBlockSchema,
    graphAssetBlockSchema,
    geometryAssetBlockSchema,
    answerLinesBlockSchema,
    captionBlockSchema,
]);

export const structuredProblemDocumentSchema = z.object({
    version: z.literal(1).default(1),
    title: z.string().optional(),
    summary: z.string().optional(),
    instructions: z.string().optional(),
    blocks: z.array(problemBlockSchema).min(1),
});

const exactAnswerSpecSchema = z.object({
    kind: z.literal('exact'),
    correctAnswer: z.string().default(''),
    acceptedAnswers: z.array(z.string()).default([]),
});

const numericAnswerSpecSchema = z.object({
    kind: z.literal('numeric'),
    correctAnswer: z.string().default(''),
    acceptedAnswers: z.array(z.string()).default([]),
    tolerance: z.number().nonnegative().default(0),
    unit: z.string().optional(),
});

const choiceAnswerSpecSchema = z.object({
    kind: z.literal('choice'),
    correctChoiceId: z.string().min(1),
});

const multiBlankAnswerSpecSchema = z.object({
    kind: z.literal('multiBlank'),
    blanks: z.array(z.object({
        id: z.string().min(1),
        correctAnswer: z.string().default(''),
        acceptedAnswers: z.array(z.string()).default([]),
    })).min(1),
});

const formulaAnswerSpecSchema = z.object({
    kind: z.literal('formula'),
    correctAnswer: z.string().default(''),
    acceptedAnswers: z.array(z.string()).default([]),
});

const rubricCriterionSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    maxPoints: z.number().min(0).default(0),
});

const rubricAnswerSpecSchema = z.object({
    kind: z.literal('rubric'),
    modelAnswer: z.string().optional(),
    rubric: z.string().min(1),
    criteria: z.array(rubricCriterionSchema).default([]),
});

const visionRubricAnswerSpecSchema = z.object({
    kind: z.literal('visionRubric'),
    modelAnswer: z.string().optional(),
    rubric: z.string().min(1),
    criteria: z.array(rubricCriterionSchema).default([]),
    expectedElements: z.array(z.string()).default([]),
});

export const answerSpecSchema = z.discriminatedUnion('kind', [
    exactAnswerSpecSchema,
    numericAnswerSpecSchema,
    choiceAnswerSpecSchema,
    multiBlankAnswerSpecSchema,
    formulaAnswerSpecSchema,
    rubricAnswerSpecSchema,
    visionRubricAnswerSpecSchema,
]);

export const printConfigSchema = z.object({
    template: z.enum(['COMPACT', 'STANDARD', 'WORKSPACE', 'GRAPH', 'TABLE', 'EXPLANATION']).default('STANDARD'),
    estimatedHeight: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'FULL']).default('MEDIUM'),
    answerMode: z.enum(['SEPARATE_SHEET', 'INLINE']).default('INLINE'),
    answerLines: z.number().int().min(0).max(20).default(3),
    showQrOnFirstPage: z.boolean().default(true),
});

export const gradingConfigSchema = z.object({
    mode: z.enum(['EXACT', 'NUMERIC_TOLERANCE', 'CHOICE', 'MULTI_BLANK', 'FORMULA', 'AI_RUBRIC', 'AI_VISION_RUBRIC']).default('EXACT'),
    maxScore: z.number().positive().default(100),
    promptFilename: z.string().optional(),
    rubricPrompt: z.string().optional(),
});

export type ProblemBlock = z.infer<typeof problemBlockSchema>;
export type ProblemFigureDisplay = z.infer<typeof problemFigureDisplaySchema>;
export type StructuredProblemDocument = z.infer<typeof structuredProblemDocumentSchema>;
export type AnswerSpec = z.infer<typeof answerSpecSchema>;
export type PrintConfig = z.infer<typeof printConfigSchema>;
export type GradingConfig = z.infer<typeof gradingConfigSchema>;

export function parseStructuredDocument(raw: unknown): StructuredProblemDocument {
    return structuredProblemDocumentSchema.parse(raw);
}

export function parseAnswerSpec(raw: unknown): AnswerSpec {
    return answerSpecSchema.parse(raw);
}

export function parsePrintConfig(raw: unknown): PrintConfig {
    return printConfigSchema.parse(raw ?? {});
}

export function parseGradingConfig(raw: unknown): GradingConfig {
    return gradingConfigSchema.parse(raw ?? {});
}

export function deriveLegacyFieldsFromStructuredData(input: {
    document: StructuredProblemDocument;
    answerSpec: AnswerSpec;
}): {
    question: string;
    answer: string;
    acceptedAnswers: string[];
} {
    const { document, answerSpec } = input;
    const question = [
        document.title,
        document.summary,
        ...document.blocks
            .filter((block) => block.type === 'paragraph' || block.type === 'caption')
            .map((block) => block.type === 'paragraph' ? block.text : block.text),
    ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);

    switch (answerSpec.kind) {
        case 'exact':
        case 'numeric':
        case 'formula':
            return {
                question,
                answer: answerSpec.correctAnswer,
                acceptedAnswers: answerSpec.acceptedAnswers,
            };
        case 'choice':
            return {
                question,
                answer: answerSpec.correctChoiceId,
                acceptedAnswers: [],
            };
        case 'multiBlank':
            return {
                question,
                answer: answerSpec.blanks.map((blank) => `${blank.id}:${blank.correctAnswer}`).join(', '),
                acceptedAnswers: answerSpec.blanks.flatMap((blank) => blank.acceptedAnswers),
            };
        case 'rubric':
        case 'visionRubric':
            return {
                question,
                answer: answerSpec.modelAnswer ?? '',
                acceptedAnswers: [],
            };
    }
}

export function buildDefaultStructuredDraft(problemType: string) {
    const safeType = problemType || 'SHORT_TEXT';

    const document: StructuredProblemDocument = {
        version: 1,
        title: '',
        summary: '',
        instructions: '',
        blocks: [
            {
                id: createStructuredBlockId(),
                type: 'paragraph',
                text: '',
            },
        ],
    };

    // 互換維持のため保持するが、構造化問題の印刷レイアウト制御には利用しない。
    const printConfig: PrintConfig = {
        template: safeType === 'GRAPH_DRAW' || safeType === 'GEOMETRY' ? 'GRAPH' : 'STANDARD',
        estimatedHeight: safeType === 'SHORT_EXPLANATION' || safeType === 'SCIENCE_EXPERIMENT' ? 'LARGE' : 'MEDIUM',
        answerMode: safeType === 'SHORT_TEXT' || safeType === 'NUMERIC' || safeType === 'MULTIPLE_CHOICE' ? 'SEPARATE_SHEET' : 'INLINE',
        answerLines: safeType === 'SHORT_EXPLANATION' ? 6 : 3,
        showQrOnFirstPage: true,
    };

    const gradingConfig: GradingConfig = {
        mode:
            safeType === 'NUMERIC' ? 'NUMERIC_TOLERANCE'
                : safeType === 'MULTIPLE_CHOICE' ? 'CHOICE'
                    : safeType === 'MULTI_BLANK' ? 'MULTI_BLANK'
                        : safeType === 'FORMULA_FINAL' ? 'FORMULA'
                            : safeType === 'SHORT_EXPLANATION' || safeType === 'SCIENCE_EXPERIMENT' || safeType === 'GRAPH_READ' || safeType === 'DIAGRAM_LABEL'
                                ? 'AI_RUBRIC'
                                : 'EXACT',
        maxScore: 100,
    };

    const answerSpec: AnswerSpec =
        gradingConfig.mode === 'CHOICE'
            ? { kind: 'choice', correctChoiceId: 'A' }
            : gradingConfig.mode === 'MULTI_BLANK'
                ? { kind: 'multiBlank', blanks: [{ id: 'blank-1', correctAnswer: '', acceptedAnswers: [] }] }
                : gradingConfig.mode === 'NUMERIC_TOLERANCE'
                    ? { kind: 'numeric', correctAnswer: '', acceptedAnswers: [], tolerance: 0, unit: '' }
                    : gradingConfig.mode === 'FORMULA'
                        ? { kind: 'formula', correctAnswer: '', acceptedAnswers: [] }
                        : gradingConfig.mode === 'AI_RUBRIC'
                            ? { kind: 'rubric', modelAnswer: '', rubric: '', criteria: [] }
                            : { kind: 'exact', correctAnswer: '', acceptedAnswers: [] };

    return { document, answerSpec, printConfig, gradingConfig };
}

export function stringifyPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
