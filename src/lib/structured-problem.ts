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
});

const imageBlockSchema = blockBaseSchema.extend({
    type: z.literal('image'),
    assetId: z.string().optional(),
    src: z.string().optional(),
    alt: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
});

const svgBlockSchema = blockBaseSchema.extend({
    type: z.literal('svg'),
    assetId: z.string().optional(),
    svg: z.string().optional(),
});

const tableBlockSchema = blockBaseSchema.extend({
    type: z.literal('table'),
    headers: z.array(z.string()).default([]),
    rows: z.array(z.array(z.string())).default([]),
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
});

const geometryAssetBlockSchema = blockBaseSchema.extend({
    type: z.literal('geometryAsset'),
    assetId: z.string().optional(),
});

const answerLinesBlockSchema = blockBaseSchema.extend({
    type: z.literal('answerLines'),
    lines: z.number().int().min(1).max(20).default(3),
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
]);

export const structuredProblemDocumentSchema = z.object({
    version: z.literal(1).default(1),
    title: z.string().optional(),
    summary: z.string().optional(),
    instructions: z.string().optional(),
    blocks: z.array(problemBlockSchema).min(1),
});

export const answerSpecSchema = z.object({
    correctAnswer: z.string().default(''),
    acceptedAnswers: z.array(z.string()).default([]),
}).strict();

export const printConfigSchema = z.object({
    template: z.enum(['COMPACT', 'STANDARD', 'WORKSPACE', 'GRAPH', 'TABLE', 'EXPLANATION']).default('STANDARD'),
    estimatedHeight: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'FULL']).default('MEDIUM'),
    answerMode: z.enum(['SEPARATE_SHEET', 'INLINE']).default('INLINE'),
    answerLines: z.number().int().min(0).max(20).default(3),
    showQrOnFirstPage: z.boolean().default(true),
});

export type ProblemBlock = z.infer<typeof problemBlockSchema>;
export type StructuredProblemDocument = z.infer<typeof structuredProblemDocumentSchema>;
export type AnswerSpec = z.infer<typeof answerSpecSchema>;
export type PrintConfig = z.infer<typeof printConfigSchema>;

function normalizeLegacyStructuredDocumentRaw(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return raw;
    }

    const document = { ...(raw as Record<string, unknown>) };
    if (!Array.isArray(document.blocks)) {
        return document;
    }

    document.blocks = document.blocks.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return [];
        }

        const block = { ...(candidate as Record<string, unknown>) };
        if (block.type === 'caption') {
            return [];
        }

        delete block.caption;
        delete block.display;

        return [block];
    });

    return document;
}

export function parseStructuredDocument(raw: unknown): StructuredProblemDocument {
    return structuredProblemDocumentSchema.parse(normalizeLegacyStructuredDocumentRaw(raw));
}

export function parseAnswerSpec(raw: unknown): AnswerSpec {
    return answerSpecSchema.parse(raw);
}

export function parsePrintConfig(raw: unknown): PrintConfig {
    return printConfigSchema.parse(raw ?? {});
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeAnswerSpecForAi(answerSpec: AnswerSpec): {
    referenceAnswer: string;
    alternativeAnswers: string[];
} {
    return {
        referenceAnswer: answerSpec.correctAnswer.trim(),
        alternativeAnswers: uniqueNonEmpty(answerSpec.acceptedAnswers),
    };
}

export function normalizeAnswerSpecForAuthoring(answerSpec: AnswerSpec): AnswerSpec {
    return {
        correctAnswer: answerSpec.correctAnswer.trim(),
        acceptedAnswers: uniqueNonEmpty(answerSpec.acceptedAnswers),
    };
}

export function buildAiProblemText(document: StructuredProblemDocument): string {
    const sections: string[] = [];

    if (document.title?.trim()) {
        sections.push(`タイトル: ${document.title.trim()}`);
    }

    if (document.summary?.trim()) {
        sections.push(`概要: ${document.summary.trim()}`);
    }

    if (document.instructions?.trim()) {
        sections.push(`指示: ${document.instructions.trim()}`);
    }

    for (const block of document.blocks) {
        switch (block.type) {
            case 'paragraph':
                sections.push(block.text.trim());
                break;
            case 'katexInline':
                sections.push(`[数式] ${block.latex}`);
                break;
            case 'katexDisplay':
                sections.push(`[数式ブロック]\n${block.latex}`);
                break;
            case 'table': {
                const rows = [
                    block.headers.length > 0 ? block.headers.join(' | ') : '',
                    ...block.rows.map((row) => row.join(' | ')),
                ].filter(Boolean);

                if (rows.length > 0) {
                    sections.push(`表:\n${rows.join('\n')}`);
                }
                break;
            }
            case 'choices':
                sections.push(`選択肢:\n${block.options.map((option) => `- ${option.id}: ${option.label}`).join('\n')}`);
                break;
            case 'blankGroup':
                sections.push(
                    `空欄:\n${block.blanks
                        .map((blank) => `- ${blank.id}: ${blank.label}${blank.placeholder ? ` (${blank.placeholder})` : ''}`)
                        .join('\n')}`,
                );
                break;
            default:
                break;
        }
    }

    return sections
        .map((section) => section.trim())
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 8000);
}

export function collectStructuredDocumentAssetIds(document: StructuredProblemDocument): string[] {
    return Array.from(new Set(
        document.blocks.flatMap((block) => {
            if (
                (block.type === 'image'
                    || block.type === 'svg'
                    || block.type === 'graphAsset'
                    || block.type === 'geometryAsset')
                && block.assetId
            ) {
                return [block.assetId];
            }

            return [];
        }),
    ));
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
    const normalizedAnswer = normalizeAnswerSpecForAi(answerSpec);
    const question = [
        document.title,
        document.summary,
        ...document.blocks
            .filter((block) => block.type === 'paragraph')
            .map((block) => block.text),
    ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);

    return {
        question,
        answer: normalizedAnswer.referenceAnswer,
        acceptedAnswers: normalizedAnswer.alternativeAnswers,
    };
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
        estimatedHeight: 'MEDIUM',
        answerMode: safeType === 'SHORT_TEXT' ? 'SEPARATE_SHEET' : 'INLINE',
        answerLines: 3,
        showQrOnFirstPage: true,
    };

    const answerSpec: AnswerSpec = { correctAnswer: '', acceptedAnswers: [] };

    return { document, answerSpec, printConfig };
}

export function stringifyPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
