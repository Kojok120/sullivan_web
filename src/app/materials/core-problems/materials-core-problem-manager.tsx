'use client';

import { useState } from 'react';
import type { CoreProblem, Subject } from '@prisma/client';

import { CoreProblemBulkImport } from '@/app/admin/curriculum/components/core-problem-bulk-import';
import { CoreProblemList } from '@/app/admin/curriculum/components/core-problem-list';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SubjectWithCoreProblems = Subject & {
    coreProblems: CoreProblem[];
};

type MaterialsCoreProblemManagerProps = {
    initialSubjects: SubjectWithCoreProblems[];
};

export function MaterialsCoreProblemManager({ initialSubjects }: MaterialsCoreProblemManagerProps) {
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(initialSubjects[0]?.id ?? null);
    const [selectedCoreProblemId, setSelectedCoreProblemId] = useState<string | null>(null);
    const activeSubjectId = selectedSubjectId && initialSubjects.some((subject) => subject.id === selectedSubjectId)
        ? selectedSubjectId
        : initialSubjects[0]?.id ?? null;
    const selectedSubject = initialSubjects.find((subject) => subject.id === activeSubjectId) ?? null;
    const activeSelectedCoreProblemId = selectedSubject?.coreProblems.some((coreProblem) => coreProblem.id === selectedCoreProblemId)
        ? selectedCoreProblemId
        : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 bg-background py-2 sm:flex-row sm:items-center sm:gap-4">
                <h2 className="whitespace-nowrap font-semibold">科目選択:</h2>
                <Tabs
                    value={activeSubjectId ?? ''}
                    onValueChange={(value) => {
                        setSelectedSubjectId(value);
                        setSelectedCoreProblemId(null);
                    }}
                    className="w-full"
                >
                    <div className="overflow-x-auto pb-1">
                        <TabsList className="w-max min-w-full md:min-w-0">
                            {initialSubjects.map((subject) => (
                                <TabsTrigger key={subject.id} value={subject.id} className="px-4">
                                    {subject.name}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </Tabs>
            </div>

            <div className="overflow-hidden rounded-lg border bg-muted/10">
                <div className="flex items-center justify-between border-b bg-muted/20 p-3 text-sm font-semibold">
                    <div className="flex items-center gap-2">
                        <span>CoreProblem一覧</span>
                        {selectedSubject && <CoreProblemBulkImport subjectId={selectedSubject.id} />}
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                        {selectedSubject?.coreProblems.length ?? 0}件
                    </span>
                </div>
                <div className="max-h-[calc(100dvh-18rem)] overflow-y-auto p-2">
                    {selectedSubject ? (
                        <CoreProblemList
                            subjectId={selectedSubject.id}
                            coreProblems={selectedSubject.coreProblems}
                            selectedId={activeSelectedCoreProblemId}
                            onSelect={setSelectedCoreProblemId}
                        />
                    ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            科目を選択してください
                        </div>
                    )}
                </div>
            </div>

            <p className="text-sm text-muted-foreground">
                問題の新規作成や編集は「問題一覧」から行います。
            </p>
        </div>
    );
}
