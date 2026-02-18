'use client';

import { useState, useEffect } from 'react';
import { Subject, CoreProblem } from '@prisma/client';
import { CoreProblemList } from './components/core-problem-list';
import { CoreProblemBulkImport } from './components/core-problem-bulk-import';
import { ProblemEditor } from './components/problem-editor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Type definitions including relations
export type SubjectWithRelations = Subject & {
    coreProblems: CoreProblem[];
};

interface CurriculumManagerProps {
    initialSubjects: SubjectWithRelations[];
}

export function CurriculumManager({ initialSubjects }: CurriculumManagerProps) {
    const [subjects, setSubjects] = useState(initialSubjects);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(subjects[0]?.id || null);
    const [selectedCoreProblemId, setSelectedCoreProblemId] = useState<string | null>(null);

    // Sync state with props when server action updates data
    useEffect(() => {
        setSubjects(initialSubjects);
    }, [initialSubjects]);

    const selectedSubject = subjects.find(s => s.id === selectedSubjectId) || null;

    // When subject changes, reset core problem selection or select the first one?
    // Let's select null for now to be safe, or maybe the first one for convenience.
    useEffect(() => {
        if (selectedSubject && selectedSubject.coreProblems.length > 0) {
            // Optional: Auto-select first core problem?
            // setSelectedCoreProblemId(selectedSubject.coreProblems[0].id);
            setSelectedCoreProblemId(null);
        } else {
            setSelectedCoreProblemId(null);
        }
    }, [selectedSubjectId]);

    return (
        <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
            {/* Header: Subject Selection */}
            <div className="flex items-center gap-4 bg-background z-10 py-2">
                <h2 className="font-semibold whitespace-nowrap">科目選択:</h2>
                <Tabs
                    value={selectedSubjectId || ''}
                    onValueChange={(val) => setSelectedSubjectId(val)}
                    className="w-full"
                >
                    <TabsList>
                        {subjects.map(subject => (
                            <TabsTrigger key={subject.id} value={subject.id} className="px-4">
                                {subject.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Main Content: 2 Columns */}
            <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">
                {/* Left Pane: Core Problems */}
                <div className="col-span-3 border rounded-lg bg-muted/10 flex flex-col overflow-hidden">
                    <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span>単元・コア問題</span>
                            {selectedSubject && <CoreProblemBulkImport subjectId={selectedSubject.id} />}
                        </div>
                        <span className="text-xs font-normal text-muted-foreground">
                            {selectedSubject?.coreProblems.length || 0}件
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {selectedSubject ? (
                            <CoreProblemList
                                subjectId={selectedSubject.id}
                                coreProblems={selectedSubject.coreProblems}
                                selectedId={selectedCoreProblemId}
                                onSelect={setSelectedCoreProblemId}
                            />
                        ) : (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                                科目を選択してください
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Pane: Problems */}
                <div className="col-span-9 border rounded-lg bg-card flex flex-col overflow-hidden shadow-sm">
                    {selectedCoreProblemId ? (
                        <ProblemEditor coreProblemId={selectedCoreProblemId} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <p>左側のリストからCoreProblemを選択して、問題を表示・編集してください</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
