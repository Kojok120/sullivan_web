'use client';

import { useState } from 'react';
import { Subject, Unit, CoreProblem, Problem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { SidebarSubjectItem } from './components/sidebar-subject-item';
import { UnitDetail } from './components/unit-detail';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

// Type definitions including relations
export type SubjectWithRelations = Subject & {
    units: (Unit & {
        coreProblems: CoreProblem[];
        subject: Subject;
    })[];
};

interface CurriculumManagerProps {
    initialSubjects: SubjectWithRelations[];
}

export function CurriculumManager({ initialSubjects }: CurriculumManagerProps) {
    // const [subjects, setSubjects] = useState<SubjectWithRelations[]>(initialSubjects);
    // Use initialSubjects directly to reflect router.refresh() updates
    const subjects = initialSubjects;
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

    // Find selected unit
    let selectedUnit: (Unit & { coreProblems: CoreProblem[]; subject: Subject }) | null = null;
    if (selectedUnitId) {
        for (const subject of subjects) {
            const unit = subject.units.find(u => u.id === selectedUnitId);
            if (unit) {
                selectedUnit = unit;
                break;
            }
        }
    }

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
            {/* Sidebar */}
            <div className="col-span-4 border-r pr-4 overflow-y-auto">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold text-lg">カリキュラム構成</h2>
                    {/* <Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button> */}
                </div>
                <Accordion type="single" collapsible className="w-full space-y-2" defaultValue={subjects[0]?.id}>
                    {subjects.map((subject) => (
                        <SidebarSubjectItem
                            key={subject.id}
                            subject={subject}
                            selectedUnitId={selectedUnitId}
                            onSelectUnit={setSelectedUnitId}
                        />
                    ))}
                </Accordion>
            </div>

            {/* Main Content */}
            <div className="col-span-8 overflow-y-auto pl-2">
                {selectedUnit ? (
                    <UnitDetail unit={selectedUnit} subjectName={selectedUnit.subject.name} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p>左側のメニューからUnitを選択してください</p>
                    </div>
                )}
            </div>
        </div>
    );
}
