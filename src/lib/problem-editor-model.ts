import type { ProblemBlock, StructuredProblemDocument } from '@/lib/structured-problem';

export type ProblemBodyDirectiveKind = 'numberline' | 'coordplane' | 'geometry' | 'solid';
export type ProblemBodyAttachmentKind = 'none' | 'upload' | 'table' | ProblemBodyDirectiveKind;
export type ProblemBodyAttachmentBlockType = Extract<ProblemBlock['type'], 'image' | 'svg' | 'table' | 'directive'> | null;

export type ProblemBodyTableData = {
    headers: string[];
    rows: string[][];
};

export type ProblemBodyCard = {
    id: string;
    text: string;
    attachmentKind: ProblemBodyAttachmentKind;
    attachmentBlockType: ProblemBodyAttachmentBlockType;
    assetId: string;
    tableData: ProblemBodyTableData;
    /**
     * directive 系（numberline / coordplane / geometry）の DSL 文字列。
     * `[[numberline ...]]` のような完全な DSL を保持する。
     */
    directiveSource: string;
};

export type ProblemBodySegment =
    | { kind: 'card'; card: ProblemBodyCard }
    | { kind: 'legacy'; block: ProblemBlock };

const CARD_ATTACHMENT_BLOCK_TYPES = new Set<ProblemBlock['type']>(['image', 'svg', 'table', 'directive']);
const DIRECTIVE_KINDS = new Set<ProblemBodyDirectiveKind>(['numberline', 'coordplane', 'geometry', 'solid']);

type CardAttachmentBlock = Extract<ProblemBlock, { type: 'image' | 'svg' | 'table' | 'directive' }>;

const EMPTY_TABLE_DATA: ProblemBodyTableData = { headers: [], rows: [] };

function createCardId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return `card-${Math.random().toString(36).slice(2, 10)}`;
}

function isCardAttachmentBlock(block: ProblemBlock | undefined): block is CardAttachmentBlock {
    if (!block || !CARD_ATTACHMENT_BLOCK_TYPES.has(block.type)) {
        return false;
    }

    if (block.type === 'image') {
        return !block.src;
    }

    if (block.type === 'svg') {
        return !block.svg;
    }

    return true;
}

function getAttachmentKind(block: CardAttachmentBlock): ProblemBodyAttachmentKind {
    switch (block.type) {
        case 'image':
        case 'svg':
            return 'upload';
        case 'table':
            return 'table';
        case 'directive':
            return DIRECTIVE_KINDS.has(block.kind) ? block.kind : 'none';
    }
}

function getAttachmentBlockType(kind: ProblemBodyAttachmentKind, currentType: ProblemBodyAttachmentBlockType): Exclude<ProblemBodyAttachmentBlockType, null> {
    switch (kind) {
        case 'upload':
            return currentType === 'svg' ? 'svg' : 'image';
        case 'table':
            return 'table';
        case 'numberline':
        case 'coordplane':
        case 'geometry':
        case 'solid':
            return 'directive';
        case 'none':
        default:
            return 'image';
    }
}

function getCardTableData(card: ProblemBodyCard): ProblemBodyTableData {
    return card.tableData ?? EMPTY_TABLE_DATA;
}

function buildCardBlocks(card: ProblemBodyCard): ProblemBlock[] {
    const blocks: ProblemBlock[] = [];

    if (card.text.trim()) {
        blocks.push({
            id: card.id,
            type: 'paragraph',
            text: card.text,
        });
    }

    if (card.attachmentKind !== 'none') {
        const figureId = `${card.id}-asset`;
        const attachmentBlockType = getAttachmentBlockType(card.attachmentKind, card.attachmentBlockType);
        let figureBlock: ProblemBlock | null;
        if (attachmentBlockType === 'image') {
            figureBlock = {
                id: figureId,
                type: 'image',
                assetId: card.assetId,
                src: '',
                alt: '',
            };
        } else if (attachmentBlockType === 'svg') {
            figureBlock = {
                id: figureId,
                type: 'svg',
                assetId: card.assetId,
                svg: '',
            };
        } else if (attachmentBlockType === 'directive') {
            const source = card.directiveSource.trim();
            const kind = card.attachmentKind as ProblemBodyDirectiveKind;
            // source 未入力なら directive ブロックを作らず、次の保存で消える形にする。
            // zod の min(1) を満たすためにも空 source は保存しない。
            figureBlock = source.length > 0
                ? { id: figureId, type: 'directive', kind, source }
                : null;
        } else {
            const table = getCardTableData(card);
            figureBlock = {
                id: figureId,
                type: 'table',
                headers: [...table.headers],
                rows: table.rows.map((row) => [...row]),
            };
        }

        if (figureBlock) {
            blocks.push(figureBlock);
        }
    }

    if (blocks.length > 0) {
        return blocks;
    }

    return [{
        id: card.id,
        type: 'paragraph',
        text: '',
    }];
}

export function createEmptyProblemBodyCard(): ProblemBodyCard {
    return {
        id: createCardId(),
        text: '',
        attachmentKind: 'none',
        attachmentBlockType: null,
        assetId: '',
        tableData: { headers: [], rows: [] },
        directiveSource: '',
    };
}

function extractCardFromAttachmentBlock(text: string, blockId: string, attachmentBlock: CardAttachmentBlock): ProblemBodyCard {
    const base: ProblemBodyCard = {
        id: blockId,
        text,
        attachmentKind: getAttachmentKind(attachmentBlock),
        attachmentBlockType: attachmentBlock.type,
        assetId: 'assetId' in attachmentBlock ? (attachmentBlock.assetId ?? '') : '',
        tableData: { headers: [], rows: [] },
        directiveSource: '',
    };

    if (attachmentBlock.type === 'table') {
        return {
            ...base,
            tableData: {
                headers: [...attachmentBlock.headers],
                rows: attachmentBlock.rows.map((row) => [...row]),
            },
        };
    }

    if (attachmentBlock.type === 'directive') {
        return {
            ...base,
            directiveSource: attachmentBlock.source,
        };
    }

    return base;
}

export function parseProblemBodySegments(blocks: ProblemBlock[]): ProblemBodySegment[] {
    const segments: ProblemBodySegment[] = [];

    for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];

        if (block.type === 'paragraph') {
            const nextBlock = blocks[index + 1];
            if (isCardAttachmentBlock(nextBlock)) {
                segments.push({
                    kind: 'card',
                    card: extractCardFromAttachmentBlock(block.text, block.id, nextBlock),
                });
                index += 1;
                continue;
            }

            segments.push({
                kind: 'card',
                card: {
                    id: block.id,
                    text: block.text,
                    attachmentKind: 'none',
                    attachmentBlockType: null,
                    assetId: '',
                    tableData: { headers: [], rows: [] },
                    directiveSource: '',
                },
            });
            continue;
        }

        if (isCardAttachmentBlock(block)) {
            segments.push({
                kind: 'card',
                card: extractCardFromAttachmentBlock('', block.id, block),
            });
            continue;
        }

        segments.push({ kind: 'legacy', block });
    }

    return segments;
}

export function rebuildDocumentFromProblemBodySegments(
    document: StructuredProblemDocument,
    segments: ProblemBodySegment[],
): StructuredProblemDocument {
    return {
        ...document,
        blocks: segments.flatMap((segment) => (
            segment.kind === 'card'
                ? buildCardBlocks(segment.card)
                : [segment.block]
        )),
    };
}

export function appendProblemBodyCard(document: StructuredProblemDocument): StructuredProblemDocument {
    const segments = parseProblemBodySegments(document.blocks);
    segments.push({ kind: 'card', card: createEmptyProblemBodyCard() });
    return rebuildDocumentFromProblemBodySegments(document, segments);
}

export function updateProblemBodyCard(
    document: StructuredProblemDocument,
    cardId: string,
    updater: (card: ProblemBodyCard) => ProblemBodyCard,
): StructuredProblemDocument {
    const segments = parseProblemBodySegments(document.blocks).map((segment) => (
        segment.kind === 'card' && segment.card.id === cardId
            ? { kind: 'card', card: updater(segment.card) }
            : segment
    )) as ProblemBodySegment[];

    return rebuildDocumentFromProblemBodySegments(document, segments);
}

export function moveProblemBodySegment(
    document: StructuredProblemDocument,
    segmentIndex: number,
    delta: number,
): StructuredProblemDocument {
    const segments = parseProblemBodySegments(document.blocks);
    const nextIndex = segmentIndex + delta;

    if (nextIndex < 0 || nextIndex >= segments.length) {
        return document;
    }

    const reordered = [...segments];
    const [removed] = reordered.splice(segmentIndex, 1);
    reordered.splice(nextIndex, 0, removed);
    return rebuildDocumentFromProblemBodySegments(document, reordered);
}

export function deleteProblemBodySegment(
    document: StructuredProblemDocument,
    segmentIndex: number,
): StructuredProblemDocument {
    const segments = parseProblemBodySegments(document.blocks);
    const nextSegments = segments.filter((_, currentIndex) => currentIndex !== segmentIndex);

    if (nextSegments.length === 0) {
        nextSegments.push({ kind: 'card', card: createEmptyProblemBodyCard() });
    }

    return rebuildDocumentFromProblemBodySegments(document, nextSegments);
}

/**
 * 解答欄タブの「形式」セレクタが state.problemType を直接管理するため、
 * ここでは選択値をそのまま採用する。GeoGebra 連携を廃止し、
 * graphAsset / geometryAsset ブロックは生成されなくなったため、
 * 図版ブロックから problemType を逆算する処理は持たない。
 */
export function deriveProblemTypeFromDocument(
    _document: StructuredProblemDocument,
    fallbackProblemType: string,
): string {
    return fallbackProblemType || 'SHORT_TEXT';
}

export function hasEmptyProblemBodyCard(cards: ProblemBodyCard[]) {
    return cards.some((card) => !card.text.trim() && card.attachmentKind === 'none');
}
