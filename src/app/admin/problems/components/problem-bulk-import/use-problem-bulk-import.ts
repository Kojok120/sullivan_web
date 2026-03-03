'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { bulkUpsertStandaloneProblems } from '../../actions';
import type { SelectedCoreProblem } from '../core-problem-selector';
import { collectNewCoreProblemIds, computeRowDiff } from './diff';
import { buildPreviewData } from './mapper';
import {
    AUTO_SUBJECT_VALUE,
    RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT,
    type BulkImportHookResult,
    type ParsedProblem,
    type ResolvedCoreProblem,
} from './types';

export function useProblemBulkImport(params: { onSuccess: () => void }): BulkImportHookResult {
    const { onSuccess } = params;

    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawInput, setRawInput] = useState('');
    const [parsedData, setParsedData] = useState<ParsedProblem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [lastWarnings, setLastWarnings] = useState<string[]>([]);
    const [showWarningsDialog, setShowWarningsDialog] = useState(false);
    const [showAllResolvedCoreProblems, setShowAllResolvedCoreProblems] = useState(false);
    const [coreProblems, setCoreProblems] = useState<SelectedCoreProblem[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState(AUTO_SUBJECT_VALUE);
    const [resolvedCoreProblems, setResolvedCoreProblems] = useState<Map<string, ResolvedCoreProblem>>(new Map());

    const hasSubjectFallback = selectedSubjectId !== AUTO_SUBJECT_VALUE;

    const visibleItems = useMemo(() => {
        return parsedData.filter((row) => {
            if (!row.existingProblem) {
                return true;
            }
            return computeRowDiff(row, coreProblems, resolvedCoreProblems).hasChanges;
        });
    }, [parsedData, coreProblems, resolvedCoreProblems]);

    const validItems = useMemo(() => visibleItems.filter((item) => item.isValid), [visibleItems]);
    const validCount = validItems.length;

    const missingCoreProblemCount = useMemo(() => {
        return validItems.filter((row) => {
            const coreProblemIds = collectNewCoreProblemIds(row, coreProblems, resolvedCoreProblems);
            return coreProblemIds.size === 0;
        }).length;
    }, [validItems, coreProblems, resolvedCoreProblems]);

    const resolvedCoreProblemItems = useMemo(() => Array.from(resolvedCoreProblems.values()), [resolvedCoreProblems]);
    const visibleResolvedCoreProblemItems = useMemo(
        () =>
            showAllResolvedCoreProblems
                ? resolvedCoreProblemItems
                : resolvedCoreProblemItems.slice(0, RESOLVED_CORE_PROBLEM_PREVIEW_LIMIT),
        [resolvedCoreProblemItems, showAllResolvedCoreProblems],
    );
    const hiddenResolvedCoreProblemCount = Math.max(
        0,
        resolvedCoreProblemItems.length - visibleResolvedCoreProblemItems.length,
    );

    async function handleParse() {
        if (!rawInput.trim()) return;

        const { parsedData: nextParsedData, resolvedCoreProblemMap } = await buildPreviewData({
            rawInput,
            coreProblems,
            hasSubjectFallback,
            selectedSubjectId,
        });

        setResolvedCoreProblems(resolvedCoreProblemMap);
        setParsedData(nextParsedData);
        setShowAllResolvedCoreProblems(false);
        setStep('preview');
    }

    function handleExecute() {
        if (validCount === 0) return;

        const fallbackSubjectId = hasSubjectFallback ? selectedSubjectId : undefined;

        startTransition(async () => {
            const problems = validItems.map((problem) => {
                const coreProblemIds = Array.from(collectNewCoreProblemIds(problem, coreProblems, resolvedCoreProblems));
                return {
                    masterNumber: problem.masterNumber,
                    question: problem.question,
                    answer: problem.answer,
                    acceptedAnswers: problem.acceptedAnswers,
                    grade: problem.grade,
                    videoUrl: problem.videoUrl,
                    coreProblemIds,
                };
            });

            const result = await bulkUpsertStandaloneProblems(problems, { subjectId: fallbackSubjectId });

            if (result.success) {
                toast.success(`${result.createdCount}件作成、${result.updatedCount}件更新しました`, {
                    style: { background: '#3b82f6', color: 'white' },
                });
                if (result.warnings && result.warnings.length > 0) {
                    setLastWarnings(result.warnings);
                    setShowWarningsDialog(true);
                    toast(`${result.warnings.length}件の警告があります`, {
                        style: { background: '#f59e0b', color: 'white' },
                        duration: 5000,
                    });
                }
                onSuccess();
                setStep('input');
                setRawInput('');
                setParsedData([]);
                setCoreProblems([]);
                setResolvedCoreProblems(new Map());
                setSelectedSubjectId(AUTO_SUBJECT_VALUE);
                setShowAllResolvedCoreProblems(false);
            } else {
                toast.error(result.error || '登録に失敗しました', {
                    style: { background: '#ef4444', color: 'white' },
                });
            }
        });
    }

    return {
        step,
        rawInput,
        parsedData,
        isPending,
        lastWarnings,
        showWarningsDialog,
        showAllResolvedCoreProblems,
        coreProblems,
        selectedSubjectId,
        resolvedCoreProblems,
        hasSubjectFallback,
        visibleItems,
        validItems,
        validCount,
        missingCoreProblemCount,
        resolvedCoreProblemItems,
        visibleResolvedCoreProblemItems,
        hiddenResolvedCoreProblemCount,
        setRawInput,
        setCoreProblems,
        setSelectedSubjectId,
        setShowWarningsDialog,
        setShowAllResolvedCoreProblems,
        setStep,
        handleParse,
        handleExecute,
    };
}
