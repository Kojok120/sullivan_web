'use client';

import { SubjectWithRelations } from '../curriculum-manager';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SidebarSubjectItemProps {
    subject: SubjectWithRelations;
    isSelected: boolean;
    onSelect: () => void;
}

export function SidebarSubjectItem({ subject, isSelected, onSelect }: SidebarSubjectItemProps) {
    return (
        <div
            onClick={onSelect}
            className={cn(
                "flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                isSelected && "bg-muted"
            )}
        >
            <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{subject.name}</span>
            </div>
            <Badge variant="secondary" className="text-[10px] h-5 px-1">
                {subject.coreProblems.length}
            </Badge>
        </div>
    );
}
