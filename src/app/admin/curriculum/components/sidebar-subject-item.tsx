'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SubjectWithRelations } from '../curriculum-manager';
import { SidebarUnitItem } from './sidebar-unit-item';
import { Badge } from '@/components/ui/badge';

interface SidebarSubjectItemProps {
    subject: SubjectWithRelations;
    selectedUnitId: string | null;
    onSelectUnit: (unitId: string) => void;
}

export function SidebarSubjectItem({ subject, selectedUnitId, onSelectUnit }: SidebarSubjectItemProps) {
    return (
        <AccordionItem value={subject.id} className="border-b-0">
            <AccordionTrigger className="hover:no-underline py-2 px-2 hover:bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 text-left">
                    <span className="font-semibold text-sm">{subject.name}</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1">{subject.units.length}</Badge>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-2 pl-4">
                <div className="space-y-1 border-l-2 border-muted pl-2">
                    {subject.units.map((unit) => (
                        <SidebarUnitItem
                            key={unit.id}
                            unit={unit}
                            isSelected={unit.id === selectedUnitId}
                            onSelect={() => onSelectUnit(unit.id)}
                        />
                    ))}
                    {subject.units.length === 0 && (
                        <div className="text-xs text-muted-foreground py-2 pl-2">Unitがありません</div>
                    )}
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
