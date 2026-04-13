import type { ProblemBlock, StructuredProblemDocument } from '@/lib/structured-problem';

export type ProblemBodyAttachmentKind = 'none' | 'upload' | 'graph' | 'geometry';
export type ProblemBodyAttachmentBlockType = Extract<ProblemBlock['type'], 'image' | 'svg' | 'graphAsset' | 'geometryAsset'> | null;

export type ProblemBodyCard = {
    id: string;
    text: string;
    attachmentKind: ProblemBodyAttachmentKind;
    attachmentBlockType: ProblemBodyAttachmentBlockType;
    assetId: string;
};

export type ProblemBodySegment =
    | { kind: 'card'; card: ProblemBodyCard }
    | { kind: 'legacy'; block: ProblemBlock };

const CARD_ATTACHMENT_BLOCK_TYPES = new Set<ProblemBlock['type']>(['image', 'svg', 'graphAsset', 'geometryAsset']);

type CardAttachmentBlock = Extract<ProblemBlock, { type: 'image' | 'svg' | 'graphAsset' | 'geometryAsset' }>;

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
        case 'graphAsset':
            return 'graph';
        case 'geometryAsset':
            return 'geometry';
    }
}

function getAttachmentBlockType(kind: ProblemBodyAttachmentKind, currentType: ProblemBodyAttachmentBlockType): Exclude<ProblemBodyAttachmentBlockType, null> {
    switch (kind) {
        case 'upload':
            return currentType === 'svg' ? 'svg' : 'image';
        case 'graph':
            return 'graphAsset';
        case 'geometry':
            return 'geometryAsset';
        case 'none':
        default:
            return 'image';
    }
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
        const figureBlock: ProblemBlock =
            attachmentBlockType === 'image'
                ? {
                    id: figureId,
                    type: 'image',
                    assetId: card.assetId,
                    src: '',
                    alt: '',
                }
                : attachmentBlockType === 'svg'
                    ? {
                        id: figureId,
                        type: 'svg',
                        assetId: card.assetId,
                        svg: '',
                    }
                    : attachmentBlockType === 'graphAsset'
                        ? {
                            id: figureId,
                            type: 'graphAsset',
                            assetId: card.assetId,
                        }
                        : {
                            id: figureId,
                            type: 'geometryAsset',
                            assetId: card.assetId,
                        };

        blocks.push(figureBlock);
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
    };
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
                    card: {
                        id: block.id,
                        text: block.text,
                        attachmentKind: getAttachmentKind(nextBlock),
                        attachmentBlockType: nextBlock.type,
                        assetId: nextBlock.assetId ?? '',
                    },
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
                },
            });
            continue;
        }

        if (isCardAttachmentBlock(block)) {
            segments.push({
                kind: 'card',
                card: {
                    id: block.id,
                    text: '',
                    attachmentKind: getAttachmentKind(block),
                    attachmentBlockType: block.type,
                    assetId: block.assetId ?? '',
                },
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

export function deriveProblemTypeFromDocument(
    document: StructuredProblemDocument,
    fallbackProblemType: string,
): string {
    if (document.blocks.some((block) => block.type === 'graphAsset')) {
        return 'GRAPH_DRAW';
    }

    if (document.blocks.some((block) => block.type === 'geometryAsset')) {
        return 'GEOMETRY';
    }

    return fallbackProblemType === 'GRAPH_DRAW' || fallbackProblemType === 'GEOMETRY'
        ? 'SHORT_TEXT'
        : (fallbackProblemType || 'SHORT_TEXT');
}

export function isVisualAttachmentKind(kind: ProblemBodyAttachmentKind) {
    return kind === 'graph' || kind === 'geometry';
}

export function hasEmptyProblemBodyCard(cards: ProblemBodyCard[]) {
    return cards.some((card) => !card.text.trim() && card.attachmentKind === 'none');
}

export function getProblemBodyCardAuthoringTool(
    card: ProblemBodyCard | null,
    preferredAuthoringTool?: string | null,
) {
    if (!card) {
        return null;
    }

    if (card.attachmentKind === 'graph') {
        return 'GEOGEBRA';
    }

    if (card.attachmentKind === 'geometry') {
        return preferredAuthoringTool === 'GEOGEBRA' ? 'GEOGEBRA' : 'SVG';
    }

    return null;
}
