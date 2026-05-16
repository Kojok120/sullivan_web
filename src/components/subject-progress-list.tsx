import { Progress } from '@/components/ui/progress';

type SubjectProgressItem = {
    subjectId: string;
    subjectName: string;
    progressPercentage: number;
};

type SubjectProgressListProps = {
    items: SubjectProgressItem[];
    wrapperClassName?: string;
    emptyMessage?: string;
};

export function SubjectProgressList({
    items,
    wrapperClassName = 'space-y-4 sm:space-y-6',
    emptyMessage = '',
}: SubjectProgressListProps) {
    if (items.length === 0) {
        return (
            <div className="text-sm text-muted-foreground text-center py-4">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={wrapperClassName}>
            {items.map((subject) => (
                <div key={subject.subjectId} className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 truncate font-medium">{subject.subjectName}</div>
                        <div className="shrink-0 text-muted-foreground">{subject.progressPercentage}%</div>
                    </div>
                    <Progress value={subject.progressPercentage} className="w-full" />
                </div>
            ))}
        </div>
    );
}
