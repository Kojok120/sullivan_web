import type { SelectedCoreProblem } from '../core-problem-selector';
import type { ParsedProblem, ParsedProblemRowTarget, ResolvedCoreProblem, RowDiffResult } from './types';

export function makeSubjectMasterKey(subjectId: string, masterNumber: number): string {
    return `${subjectId}:${masterNumber}`;
}

export function collectNewCoreProblemIds(
    row: ParsedProblemRowTarget,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>,
): Set<string> {
    const newIds = new Set<string>();

    selectedCoreProblems.forEach((coreProblem) => {
        newIds.add(coreProblem.id);
    });

    if (row.coreProblemNames && row.coreProblemNames.length > 0) {
        row.coreProblemNames.forEach((name) => {
            const resolved = resolvedCoreProblems.get(name);
            if (resolved) {
                newIds.add(resolved.id);
            }
        });
        return newIds;
    }

    if (row.coreProblemName) {
        const resolved = resolvedCoreProblems.get(row.coreProblemName);
        if (resolved) {
            newIds.add(resolved.id);
        }
    }

    return newIds;
}

export function computeRowDiff(
    row: ParsedProblem,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>,
): RowDiffResult {
    if (!row.existingProblem) {
        return {
            isQuestionChanged: false,
            isAnswerChanged: false,
            isGradeChanged: false,
            isVideoChanged: false,
            isCpChanged: false,
            hasChanges: true,
        };
    }

    const old = row.existingProblem;
    const isQuestionChanged = old.question !== row.question;
    const isAnswerChanged = (old.answer || '') !== (row.answer || '');
    const isGradeChanged = (old.grade || '') !== (row.grade || '');
    const isVideoChanged = (old.videoUrl || '') !== (row.videoUrl || '');

    const newIds = collectNewCoreProblemIds(row, selectedCoreProblems, resolvedCoreProblems);
    const oldIds = new Set(old.coreProblems.map((coreProblem) => coreProblem.id));
    const isCpChanged = newIds.size !== oldIds.size || Array.from(newIds).some((id) => !oldIds.has(id));

    return {
        isQuestionChanged,
        isAnswerChanged,
        isGradeChanged,
        isVideoChanged,
        isCpChanged,
        hasChanges: isQuestionChanged || isAnswerChanged || isGradeChanged || isVideoChanged || isCpChanged,
    };
}

export function resolveRowSubjectId(
    row: ParsedProblemRowTarget,
    selectedCoreProblems: SelectedCoreProblem[],
    resolvedCoreProblems: Map<string, ResolvedCoreProblem>,
    fallbackSubjectId?: string,
): string | undefined {
    const subjectIds = new Set<string>();

    for (const coreProblem of selectedCoreProblems) {
        if (coreProblem.subjectId) {
            subjectIds.add(coreProblem.subjectId);
        }
    }

    if (row.coreProblemNames && row.coreProblemNames.length > 0) {
        for (const name of row.coreProblemNames) {
            const resolved = resolvedCoreProblems.get(name);
            if (resolved?.subjectId) {
                subjectIds.add(resolved.subjectId);
            }
        }
    } else if (row.coreProblemName) {
        const resolved = resolvedCoreProblems.get(row.coreProblemName);
        if (resolved?.subjectId) {
            subjectIds.add(resolved.subjectId);
        }
    }

    if (subjectIds.size === 1) {
        return Array.from(subjectIds)[0];
    }
    if (subjectIds.size === 0) {
        return fallbackSubjectId;
    }

    return undefined;
}
