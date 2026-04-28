'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { getSubjects } from '../../curriculum/actions';

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
}

export function CoreProblemSelector({
    selected,
    onChange,
    active = true,
    placeholder = '単元・コア問題を選択して追加',
    emptyText = '紐付けなし',
    disabled = false,
}: CoreProblemSelectorProps) {
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);

    useEffect(() => {
        if (!active || subjects.length > 0) return;
        getSubjects().then(res => {
            if (res.success && res.subjects) {
                setSubjects(res.subjects as SubjectOption[]);
            }
        });
    }, [active, subjects.length]);

    const selectedIds = useMemo(() => new Set(selected.map(cp => cp.id)), [selected]);

    const handleAdd = (id: string) => {
        if (selectedIds.has(id)) return;
        for (const subject of subjects) {
            const found = subject.coreProblems.find(cp => cp.id === id);
            if (found) {
                onChange([
                    ...selected,
                    { id: found.id, name: found.name, subjectId: subject.id, subject: { name: subject.name } }
                ]);
                return;
            }
        }
    };

    const handleRemove = (id: string) => {
        onChange(selected.filter(cp => cp.id !== id));
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2 p-2 bg-background border rounded min-h-[40px]">
                {selected.length === 0 && <span className="text-muted-foreground text-xs py-1">{emptyText}</span>}
                {selected.map(cp => (
                    <Badge key={cp.id} variant="secondary" className="flex items-center gap-1">
                        <span>{cp.subject?.name || '??'} &gt; {cp.name || 'Unknown'}</span>
                        <button type="button" onClick={() => handleRemove(cp.id)}>
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}
            </div>

            <Select onValueChange={handleAdd} disabled={disabled || subjects.length === 0}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                    {subjects.map((subject) => (
                        <SelectGroup key={subject.id}>
                            <SelectLabel className="sticky top-0 bg-background z-10">{subject.name}</SelectLabel>
                            {subject.coreProblems && subject.coreProblems.length > 0 ? (
                                subject.coreProblems.map((cp) => {
                                    const isSelected = selectedIds.has(cp.id);
                                    return (
                                        <SelectItem
                                            key={cp.id}
                                            value={cp.id}
                                            disabled={isSelected}
                                        >
                                            {cp.name} {isSelected ? '(追加済み)' : ''}
                                        </SelectItem>
                                    );
                                })
                            ) : (
                                <div className="px-2 py-1 text-xs text-muted-foreground">コア問題がありません</div>
                            )}
                        </SelectGroup>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
