import { z } from 'zod';

import { expandAnswerTableDirectivesAsText } from '@/lib/answer-table-svg';
import { expandCoordPlaneDirectivesAsText } from '@/lib/coord-plane-svg';
import { expandGeometryDirectivesAsText } from '@/lib/geometry-svg';
import { expandNumberLineDirectivesAsText } from '@/lib/number-line-svg';
import { expandSolidDirectivesAsText } from '@/lib/solid-svg';

function expandAllDirectivesAsText(text: string): string {
    return expandSolidDirectivesAsText(
        expandGeometryDirectivesAsText(
            expandCoordPlaneDirectivesAsText(
                expandAnswerTableDirectivesAsText(
                    expandNumberLineDirectivesAsText(text),
                ),
            ),
        ),
    );
}

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

const answerLinesBlockSchema = blockBaseSchema.extend({
    type: z.literal('answerLines'),
    lines: z.number().int().min(1).max(20).default(3),
});

/**
 * 数直線 / 座標平面 / 図形 のような DSL ベース図版を、
 * 本文中の独立した添付ブロックとして保持するための型。
 * source には完全な `[[numberline ...]]` / `[[coordplane ...]]` / `[[geometry ...]]` 文字列を入れる。
 * 描画は既存の expand* と renderProblemTextHtml が担う。
 *
 * 描画は kind ではなく source 側のオープナーを見て分岐するので、
 * 整合しない組み合わせ（kind: 'geometry' に対し coordplane の source 等）は
 * document レベルの superRefine で弾く（DIRECTIVE_KIND_OPENERS を参照）。
 */
const DIRECTIVE_KIND_OPENERS: Record<'numberline' | 'coordplane' | 'geometry' | 'solid', string> = {
    numberline: '[[numberline ',
    coordplane: '[[coordplane ',
    geometry: '[[geometry ',
    solid: '[[solid ',
};

const directiveBlockSchema = blockBaseSchema.extend({
    type: z.literal('directive'),
    kind: z.enum(['numberline', 'coordplane', 'geometry', 'solid']),
    source: z.string().min(1),
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
    answerLinesBlockSchema,
    directiveBlockSchema,
]);

export const structuredProblemDocumentSchema = z.object({
    version: z.literal(1).default(1),
    summary: z.string().optional(),
    instructions: z.string().optional(),
    blocks: z.array(problemBlockSchema).min(1),
}).superRefine((value, ctx) => {
    value.blocks.forEach((block, index) => {
        if (block.type !== 'directive') return;
        const opener = DIRECTIVE_KIND_OPENERS[block.kind];
        if (!block.source.trimStart().startsWith(opener)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['blocks', index, 'source'],
                message: `directive.kind="${block.kind}" の source は "${opener.trim()} ..." で始まる必要があります`,
            });
        }
    });
});

/**
 * answerSpec は解答欄に印刷する「視覚テンプレート」専用 (Stage B' 以降)。
 * 正解の真値は ProblemRevision.correctAnswer / ProblemRevision.acceptedAnswers (専用カラム)
 * および Problem.answer / Problem.acceptedAnswers に保持する。
 *
 * 既存 DB の answerSpec JSON には Stage A+A+ 以前に書かれた correctAnswer / acceptedAnswers
 * キーが残るが、本スキーマは passthrough() でそれらを許容しつつ、コード側からは
 * answerTemplate 以外を読まない方針。Stage C で JSON から完全に削除する。
 */
export const answerSpecSchema = z.object({
    /**
     * 解答欄に印刷する視覚テンプレート。
     * 例: 数直線問題で生徒が点を書き込む空の数直線を出すために [[numberline ...]] DSL を保存する。
     * 未指定または空文字なら通常の罫線解答欄が使われる。
     */
    answerTemplate: z.string().optional(),
}).passthrough();

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
        // GeoGebra 連携を廃止したため、旧 graphAsset / geometryAsset ブロックは
        // 描画も編集もできない死蔵データとなる。読み込み時に黙って捨てる。
        if (block.type === 'graphAsset' || block.type === 'geometryAsset') {
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

/**
 * answerSpec を保存形に正規化する。Stage B' 以降は answerTemplate のみ扱う。
 * 既存 DB に残っている correctAnswer / acceptedAnswers キーは passthrough で素通りするが、
 * 戻り値からは除外して JSON を縮小する (新規保存時は新シェイプで上書きされる)。
 */
export function normalizeAnswerSpecForAuthoring(answerSpec: AnswerSpec): AnswerSpec {
    const trimmedTemplate = answerSpec.answerTemplate?.trim() ?? '';
    return {
        answerTemplate: trimmedTemplate || undefined,
    };
}

/**
 * 正解情報 (string answer + accepted answers) を保存形に正規化する。
 * Stage B' で answerSpec から分離し、ProblemRevision.correctAnswer / acceptedAnswers と
 * Problem.answer / acceptedAnswers の双方に書き込む値を生成する。
 */
export function normalizeAnswerForAuthoring(input: {
    correctAnswer: string | null | undefined;
    acceptedAnswers: readonly string[] | null | undefined;
}): {
    correctAnswer: string;
    acceptedAnswers: string[];
} {
    const trimmedCorrect = (input.correctAnswer ?? '').trim();
    const accepted = uniqueNonEmpty(Array.from(input.acceptedAnswers ?? []));
    return {
        correctAnswer: trimmedCorrect,
        acceptedAnswers: accepted,
    };
}

export function buildAiProblemText(document: StructuredProblemDocument): string {
    const sections: string[] = [];

    if (document.summary?.trim()) {
        sections.push(`概要: ${document.summary.trim()}`);
    }

    if (document.instructions?.trim()) {
        sections.push(`指示: ${document.instructions.trim()}`);
    }

    for (const block of document.blocks) {
        switch (block.type) {
            case 'paragraph':
                sections.push(expandAllDirectivesAsText(block.text).trim());
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
            case 'directive':
                sections.push(expandAllDirectivesAsText(block.source).trim());
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
            if ((block.type === 'image' || block.type === 'svg') && block.assetId) {
                return [block.assetId];
            }

            return [];
        }),
    ));
}

/**
 * 構造化ドキュメントから legacy `Problem.question` / `answer` / `acceptedAnswers` 用の値を組み立てる。
 * Stage B' 以降は answer 系を answerSpec から導出せず、呼び出し側から直接渡してもらう。
 * question は document の summary と paragraph ブロックから合成する。
 */
/**
 * publishedRevision.structuredContent を入力として、生徒画面・履歴・一覧表示などで
 * 「問題本文」として表示するための短い派生テキストを返す。
 *
 * Phase B3 で Problem.question の直接参照を撤廃するための共通ヘルパー。
 * 入力が空・解析不能なら空文字を返す（呼び出し側でプレースホルダ等にフォールバックする）。
 */
export function getDisplayQuestionFromStructuredContent(raw: unknown): string {
    if (!raw) return '';
    try {
        const document = parseStructuredDocument(raw);
        return [
            document.summary,
            ...document.blocks
                .filter((block) => block.type === 'paragraph')
                .map((block) => block.text),
        ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 4000);
    } catch {
        return '';
    }
}

export function deriveLegacyFieldsFromStructuredData(input: {
    document: StructuredProblemDocument;
    correctAnswer: string;
    acceptedAnswers: readonly string[];
}): {
    question: string;
    answer: string;
    acceptedAnswers: string[];
} {
    const { document, correctAnswer, acceptedAnswers } = input;
    const question = [
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
        answer: correctAnswer.trim(),
        acceptedAnswers: uniqueNonEmpty(Array.from(acceptedAnswers)),
    };
}

/**
 * `buildStructuredDocumentFromText` の出力が paragraph ブロックのみで構成されるため、
 * 既存 structuredContent に非 paragraph ブロックや summary/instructions が含まれる場合は
 * プレーンテキストから再構築する処理で図形・選択肢・空欄などの構造化データが消失する。
 * 本ヘルパーは「プレーンテキストへ flatten すると情報が失われる構造を持つか」を判定する。
 *
 * 入力が空・解析不能な場合は false (= 失われる情報なし) を返す。
 */
export function wouldFlattenLoseStructuredContent(raw: unknown): boolean {
    if (!raw) return false;
    try {
        const document = parseStructuredDocument(raw);
        if (document.summary?.trim() || document.instructions?.trim()) {
            return true;
        }
        return document.blocks.some((block) => block.type !== 'paragraph');
    } catch {
        return false;
    }
}

/**
 * プレーンテキストの問題文から最小構成の structuredContent ドキュメントを組み立てる。
 * 連続する改行で段落を切り出し、空段落はスキップする。
 * 空文字や空白のみの入力は paragraph schema (text.min(1)) に違反するため例外を投げる。
 */
export class BlankStructuredQuestionError extends Error {
    constructor() {
        super('問題文が空のため structured content を生成できません');
        this.name = 'BlankStructuredQuestionError';
    }
}

export function buildStructuredDocumentFromText(text: string): StructuredProblemDocument {
    const paragraphs = (text ?? '')
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (paragraphs.length === 0) {
        throw new BlankStructuredQuestionError();
    }

    const blocks = paragraphs.map((paragraphText) => ({
        id: createStructuredBlockId(),
        type: 'paragraph' as const,
        text: paragraphText,
    }));

    return {
        version: 1,
        blocks,
    };
}

export function buildDefaultStructuredDraft(problemType: string) {
    const safeType = problemType || 'SHORT_TEXT';

    const document: StructuredProblemDocument = {
        version: 1,
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
        template: 'STANDARD',
        estimatedHeight: 'MEDIUM',
        answerMode: safeType === 'SHORT_TEXT' ? 'SEPARATE_SHEET' : 'INLINE',
        answerLines: 3,
        showQrOnFirstPage: true,
    };

    const answerSpec: AnswerSpec = {};

    return { document, answerSpec, printConfig };
}

export function stringifyPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
