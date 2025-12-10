'use client';

import { CoreProblem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { CoreProblemItem } from './core-problem-item';

interface CoreProblemListProps {
    subjectId: string;
    coreProblems: CoreProblem[];
    subjectName: string;
}

export function CoreProblemList({ subjectId, coreProblems, subjectName }: CoreProblemListProps) {
    return (
        <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold text-muted-foreground">Core Problems</h4>
            </div>

            <Accordion type="single" collapsible className="space-y-2">
                {coreProblems.map((cp) => (
                    <CoreProblemItem key={cp.id} coreProblem={cp} subjectName={subjectName} />
                ))}
                {coreProblems.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4">
                        CoreProblemがありません。右上のボタンから追加してください。
                    </div>
                )}
            </Accordion>
        </div>
    );
}
