'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { getProblemEditorContext } from '../actions';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export type ProblemEditorSubjectOption = {
    id: string;
    name: string;
};

export type ProblemEditorCoreProblemOption = {
    id: string;
    name: string;
    subjectId: string;
    subject?: { name: string };
};

type SubjectOption = {
    id: string;
    name: string;
    coreProblems: { id: string; name: string }[];
};

export type SelectedCoreProblem = {
    id: string;
    name?: string;
    subjectId?: string;
    subject?: { name: string };
};

interface CoreProblemSelectorProps {
    selected: SelectedCoreProblem[];
    onChange: (next: SelectedCoreProblem[]) => void;
    active?: boolean;
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    subjectId?: string | null;
    subjects?: ProblemEditorSubjectOption[];
    coreProblems?: ProblemEditorCoreProblemOption[];
}

function buildSubjectOptions(
    subjects: ProblemEditorSubjectOption[],
    coreProblems: ProblemEditorCoreProblemOption[],
): SubjectOption[] {
    return subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        coreProblems: coreProblems
            .filter((coreProblem) => coreProblem.subjectId === subject.id)
            .map((coreProblem) => ({
                id: coreProblem.id,
                name: coreProblem.name,
            })),
    }));
}

export function CoreProblemSelector({
    selected,
    onChange,
    active = true,
    placeholder = '単元・コア問題を選択して追加',
    emptyText = '紐付けなし',
    disabled = false,
    subjectId,
    subjects = [],
    coreProblems = [],
}: CoreProblemSelectorProps) {
    const [fetchedSubjects, setFetchedSubjects] = useState<SubjectOption[]>([]);

    const providedSubjects = useMemo(
        () => buildSubjectOptions(subjects, coreProblems),
        [subjects, coreProblems],
    );
    const subjectOptions = providedSubjects.length > 0 ? providedSubjects : fetchedSubjects;

    useEffect(() => {
        if (!active || providedSubjects.length > 0 || fetchedSubjects.length > 0) {
            return;
        }

        let cancelled = false;

        getProblemEditorContext().then((response) => {
            if (cancelled || !response.subjects || !response.coreProblems) {
                return;
            }

            setFetchedSubjects(buildSubjectOptions(response.subjects, response.coreProblems));
        });

        return () => {
            cancelled = true;
        };
    }, [active, fetchedSubjects.length, providedSubjects.length]);

    const isSubjectScoped = subjectId !== undefined;
    const hasSelectedSubject = Boolean(subjectId);
    const visibleSubjects = useMemo(() => {
        if (!isSubjectScoped) {
            return subjectOptions;
        }

        if (!subjectId) {
            return [];
        }

        return subjectOptions.filter((subject) => subject.id === subjectId);
    }, [isSubjectScoped, subjectId, subjectOptions]);
    const selectedIds = useMemo(() => new Set(selected.map((coreProblem) => coreProblem.id)), [selected]);
    const isDisabled = disabled
        || subjectOptions.length === 0
        || (isSubjectScoped && !hasSelectedSubject);
    const placeholderText = isSubjectScoped && !hasSelectedSubject
        ? '先に科目を選択してください'
        : placeholder;

    const handleAdd = (id: string) => {
        if (selectedIds.has(id)) {
            return;
        }

        for (const subject of visibleSubjects) {
            const found = subject.coreProblems.find((coreProblem) => coreProblem.id === id);
            if (!found) {
                continue;
            }

            onChange([
                ...selected,
                {
                    id: found.id,
                    name: found.name,
                    subjectId: subject.id,
                    subject: { name: subject.name },
                },
            ]);
            return;
        }
    };

    const handleRemove = (id: string) => {
        onChange(selected.filter((coreProblem) => coreProblem.id !== id));
    };

    return (
        <div className="space-y-2">
            <div className="min-h-[40px] rounded border bg-background p-2">
                <div className="flex flex-wrap gap-2">
                    {selected.length === 0 && (
                        <span className="py-1 text-xs text-muted-foreground">{emptyText}</span>
                    )}
                    {selected.map((coreProblem) => (
                        <Badge key={coreProblem.id} variant="secondary" className="flex items-center gap-1">
                            <span>
                                {coreProblem.subject?.name || '??'} &gt; {coreProblem.name || 'Unknown'}
                            </span>
                            <button
                                type="button"
                                aria-label={`${coreProblem.name || '単元'}を削除`}
                                onClick={() => handleRemove(coreProblem.id)}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            </div>

            <Select onValueChange={handleAdd} disabled={isDisabled}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholderText} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                    {visibleSubjects.map((subject) => (
                        <SelectGroup key={subject.id}>
                            <SelectLabel className="sticky top-0 z-10 bg-background">{subject.name}</SelectLabel>
                            {subject.coreProblems.length > 0 ? (
                                subject.coreProblems.map((coreProblem) => {
                                    const isSelected = selectedIds.has(coreProblem.id);
                                    return (
                                        <SelectItem
                                            key={coreProblem.id}
                                            value={coreProblem.id}
                                            disabled={isSelected}
                                        >
                                            {coreProblem.name} {isSelected ? '(追加済み)' : ''}
                                        </SelectItem>
                                    );
                                })
                            ) : (
                                <div className="px-2 py-1 text-xs text-muted-foreground">
                                    コア問題がありません
                                </div>
                            )}
                        </SelectGroup>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
