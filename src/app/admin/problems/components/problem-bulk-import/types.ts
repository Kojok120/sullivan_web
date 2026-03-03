import type { SelectedCoreProblem } from '../core-problem-selector';

export interface BulkImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subjects: { id: string; name: string }[];
    onSuccess: () => void;
}

export const RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT = 24;
export const AUTO_SUBJECT_VALUE = '__AUTO_SUBJECT__';

export type ExistingProblemSnapshot = {
    question: string;
    answer: string | null;
    grade: string | null;
    videoUrl: string | null;
    coreProblems: { id: string }[];
};

export type ResolvedCoreProblem = {
    id: string;
    name: string;
    subjectId: string;
    subject: { name: string };
};

export type ParsedExistingProblem = {
    subjectId: string;
    masterNumber: number | null;
    question: string;
    answer: string | null;
    grade: string | null;
    videoUrl: string | null;
    coreProblems: { id: string }[];
};

export interface ParsedProblem {
    masterNumber?: number;
    question: string;
    answer: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemName?: string;
    coreProblemNames?: string[];
    isValid: boolean;
    error?: string;
    resolvedSubjectId?: string;
    existingProblem?: ExistingProblemSnapshot;
}

export type RowDiffResult = {
    isQuestionChanged: boolean;
    isAnswerChanged: boolean;
    isGradeChanged: boolean;
    isVideoChanged: boolean;
    isCpChanged: boolean;
    hasChanges: boolean;
};

export type ParsedProblemRowTarget = Pick<ParsedProblem, 'coreProblemNames' | 'coreProblemName'>;

export type BulkImportHookResult = {
    step: 'input' | 'preview';
    rawInput: string;
    parsedData: ParsedProblem[];
    isPending: boolean;
    lastWarnings: string[];
    showWarningsDialog: boolean;
    showAllResolvedCoreProblems: boolean;
    coreProblems: SelectedCoreProblem[];
    selectedSubjectId: string;
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>;
    hasSubjectFallback: boolean;
    visibleItems: ParsedProblem[];
    validItems: ParsedProblem[];
    validCount: number;
    missingCoreProblemCount: number;
    resolvedCoreProblemItems: ResolvedCoreProblem[];
    visibleResolvedCoreProblemItems: ResolvedCoreProblem[];
    hiddenResolvedCoreProblemCount: number;
    setRawInput: (value: string) => void;
    setCoreProblems: (value: SelectedCoreProblem[]) => void;
    setSelectedSubjectId: (value: string) => void;
    setShowWarningsDialog: (value: boolean) => void;
    setShowAllResolvedCoreProblems: (value: boolean) => void;
    setStep: (value: 'input' | 'preview') => void;
    handleParse: () => Promise<void>;
    handleExecute: () => void;
};
