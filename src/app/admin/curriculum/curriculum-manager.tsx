'use client';

import { useState } from 'react';
import { Subject, CoreProblem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { SidebarSubjectItem } from './components/sidebar-subject-item';
import { SubjectDetail } from './components/subject-detail'; // Renamed/New component
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

// Type definitions including relations
export type SubjectWithRelations = Subject & {
    coreProblems: CoreProblem[];
};

interface CurriculumManagerProps {
    initialSubjects: SubjectWithRelations[];
}

export function CurriculumManager({ initialSubjects }: CurriculumManagerProps) {
    const subjects = initialSubjects;
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(subjects[0]?.id || null);

    const selectedSubject = subjects.find(s => s.id === selectedSubjectId) || null;

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
            {/* Sidebar */}
            <div className="col-span-4 border-r pr-4 overflow-y-auto">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold text-lg">科目一覧</h2>
                </div>
                <div className="space-y-2">
                    {subjects.map((subject) => (
                        <SidebarSubjectItem
                            key={subject.id}
                            subject={subject}
                            isSelected={subject.id === selectedSubjectId}
                            onSelect={() => setSelectedSubjectId(subject.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="col-span-8 overflow-y-auto pl-2">
                {selectedSubject ? (
                    <SubjectDetail subject={selectedSubject} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p>左側のメニューから科目を選択してください</p>
                    </div>
                )}
            </div>
        </div>
    );
}
