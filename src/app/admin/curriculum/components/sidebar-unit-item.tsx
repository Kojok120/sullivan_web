'use client';

import { Unit, CoreProblem } from '@prisma/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface SidebarUnitItemProps {
    unit: Unit & { coreProblems: CoreProblem[] };
    isSelected: boolean;
    onSelect: () => void;
}

export function SidebarUnitItem({ unit, isSelected, onSelect }: SidebarUnitItemProps) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn(
                "w-full justify-start h-auto py-2 px-2 font-normal",
                isSelected ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
            )}
            onClick={onSelect}
        >
            <FileText className="mr-2 h-3 w-3" />
            <span className="truncate">{unit.name}</span>
        </Button>
    );
}
