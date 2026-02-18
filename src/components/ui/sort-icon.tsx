import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortIconProps {
    active: boolean;
    sortOrder: 'asc' | 'desc';
    className?: string;
}

export function SortIcon({ active, sortOrder, className }: SortIconProps) {
    return (
        <ArrowUpDown
            className={cn(
                'ml-2 h-4 w-4',
                active ? (sortOrder === 'asc' ? 'text-primary' : 'text-primary/80') : 'opacity-50',
                className
            )}
        />
    );
}
