import { parseProblemTSV } from '@/lib/tsv-parser';

import { bulkSearchCoreProblems, searchProblemsByMasterNumbers } from '../../actions';
import type { SelectedCoreProblem } from '../core-problem-selector';
import { makeSubjectMasterKey, resolveRowSubjectId } from './diff';
import type { ParsedExistingProblem, ParsedProblem, ResolvedCoreProblem } from './types';

type BuildPreviewDataParams = {
    rawInput: string;
    coreProblems: SelectedCoreProblem[];
    hasSubjectFallback: boolean;
    selectedSubjectId: string;
};

export async function buildPreviewData(params: BuildPreviewDataParams): Promise<{
    parsedData: ParsedProblem[];
    resolvedCoreProblemMap: Map<string, ResolvedCoreProblem>;
}> {
    const rows = parseProblemTSV(params.rawInput);

    const coreProblemNames = new Set<string>();

    const parsed = rows.map((row) => {
        const isValid = !!row.question;
        const error = !isValid ? '問題文は必須です' : undefined;

        for (const name of row.coreProblemNames) {
            coreProblemNames.add(name);
        }

        return {
            masterNumber: row.masterNumber,
            question: row.question,
            answer: row.answer,
            acceptedAnswers: row.acceptedAnswers.length > 0 ? row.acceptedAnswers : undefined,
            grade: row.grade,
            videoUrl: row.videoUrl,
            coreProblemName: row.coreProblemName,
            coreProblemNames: row.coreProblemNames,
            isValid,
            error,
        } satisfies ParsedProblem;
    });

    const resolvedCoreProblemMap = new Map<string, ResolvedCoreProblem>();
    if (coreProblemNames.size > 0) {
        const { coreProblemsMap } = await bulkSearchCoreProblems(Array.from(coreProblemNames));
        if (coreProblemsMap) {
            for (const name of coreProblemNames) {
                const resolved = coreProblemsMap[name];
                if (resolved) {
                    resolvedCoreProblemMap.set(name, resolved as ResolvedCoreProblem);
                }
            }
        }
    }

    const fallbackSubjectId = params.hasSubjectFallback ? params.selectedSubjectId : undefined;
    const lookupTargets = Array.from(
        new Map(
            parsed
                .map((row) => {
                    if (typeof row.masterNumber !== 'number') {
                        return null;
                    }
                    const subjectId = resolveRowSubjectId(row, params.coreProblems, resolvedCoreProblemMap, fallbackSubjectId);
                    if (!subjectId) {
                        return null;
                    }
                    return {
                        masterNumber: row.masterNumber,
                        subjectId,
                    };
                })
                .filter((target): target is { masterNumber: number; subjectId: string } => target !== null)
                .map((target) => [makeSubjectMasterKey(target.subjectId, target.masterNumber), target]),
        ).values(),
    );

    const existingMap = new Map<string, ParsedProblem['existingProblem']>();
    if (lookupTargets.length > 0) {
        const { problems } = await searchProblemsByMasterNumbers(lookupTargets);
        if (problems) {
            const existingProblems = problems as ParsedExistingProblem[];
            existingProblems.forEach((problem) => {
                if (problem.masterNumber === null) {
                    return;
                }
                existingMap.set(makeSubjectMasterKey(problem.subjectId, problem.masterNumber), {
                    question: problem.question,
                    answer: problem.answer,
                    grade: problem.grade,
                    videoUrl: problem.videoUrl,
                    coreProblems: problem.coreProblems,
                });
            });
        }
    }

    const parsedData = parsed.map((row) => {
        const resolvedSubjectId =
            typeof row.masterNumber === 'number'
                ? resolveRowSubjectId(row, params.coreProblems, resolvedCoreProblemMap, fallbackSubjectId)
                : undefined;
        return {
            ...row,
            resolvedSubjectId,
            existingProblem:
                typeof row.masterNumber === 'number' && resolvedSubjectId
                    ? existingMap.get(makeSubjectMasterKey(resolvedSubjectId, row.masterNumber))
                    : undefined,
        };
    });

    return {
        parsedData,
        resolvedCoreProblemMap,
    };
}
