'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SubjectWithRelations } from '../curriculum-manager';
import { UnitList } from './unit-list';
import { Badge } from '@/components/ui/badge';

interface SubjectItemProps {
    subject: SubjectWithRelations;
}

export function SubjectItem({ subject }: SubjectItemProps) {
    return (
        <AccordionItem value={subject.id} className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-lg">{subject.name}</span>
                    <Badge variant="secondary">{subject.units.length} Units</Badge>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
                <UnitList subjectId={subject.id} units={subject.units} />
            </AccordionContent>
        </AccordionItem>
    );
}
