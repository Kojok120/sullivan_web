'use client';

import { useState } from 'react';
import type { CoreProblem, Subject } from '@prisma/client';
import { useTranslations } from 'next-intl';

import { CoreProblemBulkImport } from '@/app/admin/curriculum/components/core-problem-bulk-import';
import { CoreProblemList } from '@/app/admin/curriculum/components/core-problem-list';
import { ProblemEditor } from '@/app/admin/curriculum/components/problem-editor';
import { Button } from '@/components/ui/button';
import { ResizableSplit } from '@/components/ui/resizable-split';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SubjectWithCoreProblems = Subject & {
    coreProblems: CoreProblem[];
};

type MaterialsCoreProblemManagerProps = {
    initialSubjects: SubjectWithCoreProblems[];
};

const buildEditHref = (problemId: string) => `/materials/problems/${problemId}`;

export function MaterialsCoreProblemManager({ initialSubjects }: MaterialsCoreProblemManagerProps) {
    const t = useTranslations('MaterialsCoreProblemManager');
    const [rawSelectedSubjectId, setRawSelectedSubjectId] = useState<string | null>(initialSubjects[0]?.id ?? null);
    const [rawSelectedCoreProblemId, setRawSelectedCoreProblemId] = useState<string | null>(null);
    const [rawMobilePane, setRawMobilePane] = useState<'core' | 'problems'>('core');

    const selectedSubjectId = rawSelectedSubjectId && initialSubjects.some((subject) => subject.id === rawSelectedSubjectId)
        ? rawSelectedSubjectId
        : initialSubjects[0]?.id ?? null;
    const selectedSubject = initialSubjects.find((subject) => subject.id === selectedSubjectId) ?? null;
    const selectedCoreProblemId = selectedSubject?.coreProblems.some((coreProblem) => coreProblem.id === rawSelectedCoreProblemId)
        ? rawSelectedCoreProblemId
        : null;
    const mobilePane = selectedCoreProblemId ? rawMobilePane : 'core';

    const handleSubjectChange = (subjectId: string) => {
        setRawSelectedSubjectId(subjectId);
        setRawSelectedCoreProblemId(null);
        setRawMobilePane('core');
    };

    return (
        <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 md:h-[calc(100vh-10rem)]">
            <div className="z-10 flex flex-col gap-2 bg-background py-2 sm:flex-row sm:items-center sm:gap-4">
                <h2 className="whitespace-nowrap font-semibold">{t('subjectSelection')}</h2>
                <Tabs
                    value={selectedSubjectId ?? ''}
                    onValueChange={handleSubjectChange}
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

            <div className="flex gap-2 md:hidden">
                <Button
                    variant={mobilePane === 'core' ? 'default' : 'outline'}
                    className="min-h-11 flex-1"
                    onClick={() => setRawMobilePane('core')}
                >
                    {t('coreProblemList')}
                </Button>
                <Button
                    variant={mobilePane === 'problems' ? 'default' : 'outline'}
                    className="min-h-11 flex-1"
                    onClick={() => setRawMobilePane('problems')}
                    disabled={!selectedCoreProblemId}
                >
                    {t('problemList')}
                </Button>
            </div>

            <div className="flex-1 overflow-hidden md:hidden">
                {mobilePane === 'core' ? (
                    <div className="flex h-full flex-col rounded-lg border bg-muted/10">
                        <div className="flex items-center justify-between border-b bg-muted/20 p-3 text-sm font-semibold">
                            <div className="flex items-center gap-2">
                                <span>{t('coreProblemList')}</span>
                                {selectedSubject && <CoreProblemBulkImport subjectId={selectedSubject.id} />}
                            </div>
                            <span className="text-xs font-normal text-muted-foreground">
                                {t('count', { count: selectedSubject?.coreProblems.length ?? 0 })}
                            </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {selectedSubject ? (
                                <CoreProblemList
                                    subjectId={selectedSubject.id}
                                    coreProblems={selectedSubject.coreProblems}
                                    selectedId={selectedCoreProblemId}
                                    onSelect={(id) => {
                                        setRawSelectedCoreProblemId(id);
                                        if (id) setRawMobilePane('problems');
                                    }}
                                />
                            ) : (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    {t('selectSubject')}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full overflow-hidden rounded-lg border bg-card">
                        {selectedCoreProblemId ? (
                            <ProblemEditor
                                coreProblemId={selectedCoreProblemId}
                                editHrefBuilder={buildEditHref}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                                <p>{t('selectCoreProblem')}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="hidden flex-1 overflow-hidden md:block">
                <ResizableSplit
                    storageKey="materials-core-problem-split"
                    defaultLeftPercent={25}
                    minLeftPercent={15}
                    maxLeftPercent={60}
                    left={
                        <div className="border rounded-lg bg-muted/10 flex h-full flex-col overflow-hidden">
                            <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span>{t('coreProblemList')}</span>
                                    {selectedSubject && <CoreProblemBulkImport subjectId={selectedSubject.id} />}
                                </div>
                                <span className="text-xs font-normal text-muted-foreground">
                                    {t('count', { count: selectedSubject?.coreProblems.length ?? 0 })}
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2">
                                {selectedSubject ? (
                                    <CoreProblemList
                                        subjectId={selectedSubject.id}
                                        coreProblems={selectedSubject.coreProblems}
                                        selectedId={selectedCoreProblemId}
                                        onSelect={(id) => setRawSelectedCoreProblemId(id)}
                                    />
                                ) : (
                                    <div className="p-4 text-center text-muted-foreground text-sm">
                                        {t('selectSubject')}
                                    </div>
                                )}
                            </div>
                        </div>
                    }
                    right={
                        <div className="border rounded-lg bg-card flex h-full flex-col overflow-hidden">
                            {selectedCoreProblemId ? (
                                <ProblemEditor
                                    coreProblemId={selectedCoreProblemId}
                                    editHrefBuilder={buildEditHref}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <p>{t('selectCoreProblemFromList')}</p>
                                </div>
                            )}
                        </div>
                    }
                />
            </div>
        </div>
    );
}
