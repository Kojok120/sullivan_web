import type { User } from '@prisma/client';

import type { QRData } from '@/lib/qr-utils';

export type Evaluation = 'A' | 'B' | 'C' | 'D';

export type GradingResult = {
    studentId: string;
    problemId: string;
    isCorrect: boolean;
    evaluation: Evaluation;
    feedback: string;
    badCoreProblemIds: string[];
    userAnswer: string;
};

export type GradingValidationResult = {
    isValid: boolean;
    errors: string[];
    validatedResults: GradingResult[];
};

export type ProblemForGrading = {
    id: string;
    customId: string | null;
    question: string;
    answer: string | null;
    acceptedAnswers: string[];
    coreProblems: { id: string; name: string }[];
};

export type PreparedFile = {
    base64Data: string;
    mimeType: string;
    isPdfHeader: boolean;
};

export type AnalyzedFile = {
    destPath: string;
    prepared: PreparedFile;
    qrData: QRData | null;
    studentId: string | null;
    user: User | null;
    cleanup: () => Promise<void>;
};

export type GradingBatchSummary = {
    groupId: string;
    sessionIsPerfect: boolean;
};
