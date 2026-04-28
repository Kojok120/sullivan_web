import type { ProblemEditorViewMode } from '@/lib/problem-ui';

export type BulkImportVariant = 'default' | 'english-sheet';

type SubjectLike = {
    id: string;
    name: string;
};

type SortKey = 'masterNumber' | 'customId' | 'createdAt' | 'updatedAt';

export type ProblemBulkImportConfig = {
    defaultSubjectId?: string;
    lockSubjectSelection?: boolean;
    variant?: BulkImportVariant;
};

export type ProblemListUiPolicy = {
    showMasterNumber: boolean;
    showBulkImport: boolean;
    bulkImportLabel: string;
    bulkImportConfig: ProblemBulkImportConfig;
};

const MASTER_NUMBER_HIDDEN_SUBJECTS = new Set(['数学', '国語', '理科']);

export function shouldShowProblemMasterNumber(subjectName: string) {
    return !MASTER_NUMBER_HIDDEN_SUBJECTS.has(subjectName);
}

export function isEnglishProblemSubject(subjectName: string) {
    return subjectName === '英語';
}

export function normalizeProblemSortBy(sortBy: SortKey, subjectName: string): SortKey {
    if (!shouldShowProblemMasterNumber(subjectName) && sortBy === 'masterNumber') {
        return 'updatedAt';
    }

    return sortBy;
}

export function buildProblemListUiPolicy(
    currentSubject: SubjectLike,
    viewMode: ProblemEditorViewMode = 'admin',
): ProblemListUiPolicy {
    const isEnglishSubject = isEnglishProblemSubject(currentSubject.name);

    return {
        showMasterNumber: shouldShowProblemMasterNumber(currentSubject.name),
        showBulkImport: viewMode === 'admin' || isEnglishSubject,
        bulkImportLabel: isEnglishSubject ? '英語シート一括登録' : '一括登録',
        bulkImportConfig: isEnglishSubject
            ? {
                defaultSubjectId: currentSubject.id,
                lockSubjectSelection: true,
                variant: 'english-sheet',
            }
            : {
                variant: 'default',
            },
    };
}
