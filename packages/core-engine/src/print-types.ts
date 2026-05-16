import type {
    AnswerSpec,
    PrintConfig,
    StructuredProblemDocument,
} from '@/lib/structured-problem';

export type PrintableProblemAsset = {
    id: string;
    kind: string;
    fileName: string;
    mimeType: string;
    storageKey?: string | null;
    inlineContent?: string | null;
    width?: number | null;
    height?: number | null;
    signedUrl?: string | null;
};

export type PrintableProblem = {
    id: string;
    customId: string;
    order: number;
    problemType?: string;
    status?: string;
    publishedRevisionId?: string | null;
    structuredContent?: StructuredProblemDocument | null;
    answerSpec?: AnswerSpec | null;
    printConfig?: PrintConfig | null;
    assets?: PrintableProblemAsset[];
};
