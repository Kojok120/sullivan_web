'use client';

import { useState, useEffect } from 'react';
import { Subject, CoreProblem } from '@prisma/client';
import { CoreProblemList } from './components/core-problem-list';
import { CoreProblemBulkImport } from './components/core-problem-bulk-import';
import { ProblemEditor } from './components/problem-editor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

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
    const [mobilePane, setMobilePane] = useState<'core' | 'problems'>('core');

    // Sync state with props when server action updates data
    useEffect(() => {
        setSubjects(initialSubjects);
    }, [initialSubjects]);

    const selectedSubject = subjects.find(s => s.id === selectedSubjectId) || null;

    // When subject changes, reset core problem selection or select the first one?
    // Let's select null for now to be safe, or maybe the first one for convenience.
    useEffect(() => {
        const activeSubject = subjects.find((s) => s.id === selectedSubjectId) || null;
        if (activeSubject && activeSubject.coreProblems.length > 0) {
            // Optional: Auto-select first core problem?
            // setSelectedCoreProblemId(selectedSubject.coreProblems[0].id);
            setSelectedCoreProblemId(null);
            setMobilePane('core');
        } else {
            setSelectedCoreProblemId(null);
            setMobilePane('core');
        }
    }, [selectedSubjectId, subjects]);

    return (
        <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 md:h-[calc(100vh-10rem)]">
            {/* Header: Subject Selection */}
            <div className="z-10 flex flex-col gap-2 bg-background py-2 sm:flex-row sm:items-center sm:gap-4">
                <h2 className="whitespace-nowrap font-semibold">科目選択:</h2>
                <Tabs
                    value={selectedSubjectId || ''}
                    onValueChange={(val) => setSelectedSubjectId(val)}
                    className="w-full"
                >
                    <div className="overflow-x-auto pb-1">
                        <TabsList className="w-max min-w-full md:min-w-0">
                        {subjects.map(subject => (
                            <TabsTrigger key={subject.id} value={subject.id} className="px-4">
                                {subject.name}
                            </TabsTrigger>
                        ))}
                        </TabsList>
                    </div>
                </Tabs>
            </div>

            <div className="flex gap-2 md:hidden">
                <Button
                    variant={mobilePane === 'core' ? 'default' : 'outline'}
                    className="min-h-11 flex-1"
                    onClick={() => setMobilePane('core')}
                >
                    CoreProblem一覧
                </Button>
                <Button
                    variant={mobilePane === 'problems' ? 'default' : 'outline'}
                    className="min-h-11 flex-1"
                    onClick={() => setMobilePane('problems')}
                    disabled={!selectedCoreProblemId}
                >
                    問題一覧
                </Button>
            </div>

            {/* Mobile Content */}
            <div className="flex-1 overflow-hidden md:hidden">
                {mobilePane === 'core' ? (
                    <div className="flex h-full flex-col rounded-lg border bg-muted/10">
                        <div className="flex items-center justify-between border-b bg-muted/20 p-3 text-sm font-semibold">
                            <div className="flex items-center gap-2">
                                <span>単元・コア問題</span>
                                {selectedSubject && <CoreProblemBulkImport subjectId={selectedSubject.id} />}
                            </div>
                            <span className="text-xs font-normal text-muted-foreground">
                                {selectedSubject?.coreProblems.length || 0}件
                            </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {selectedSubject ? (
                                <CoreProblemList
                                    subjectId={selectedSubject.id}
                                    coreProblems={selectedSubject.coreProblems}
                                    selectedId={selectedCoreProblemId}
                                    onSelect={(id) => {
                                        setSelectedCoreProblemId(id);
                                        if (id) setMobilePane('problems');
                                    }}
                                />
                            ) : (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    科目を選択してください
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full overflow-hidden rounded-lg border bg-card shadow-sm">
                        {selectedCoreProblemId ? (
                            <ProblemEditor coreProblemId={selectedCoreProblemId} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                                <p>CoreProblemを選択してください</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Desktop Content: 2 Columns */}
            <div className="hidden flex-1 overflow-hidden gap-6 md:grid md:grid-cols-12">
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
                                onSelect={(id) => setSelectedCoreProblemId(id)}
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
