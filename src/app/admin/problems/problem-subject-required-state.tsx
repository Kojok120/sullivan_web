import Link from 'next/link';

import { Button } from '@/components/ui/button';

type ProblemSubjectRequiredStateProps = {
    routeBase: string;
    subjects: {
        id: string;
        name: string;
    }[];
};

export function ProblemSubjectRequiredState({
    routeBase,
    subjects,
}: ProblemSubjectRequiredStateProps) {
    return (
        <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">教科別の問題一覧を選択してください</h2>
            <p className="mt-2 text-sm text-muted-foreground">
                全教科横断の問題一覧は廃止しました。ナビゲーション、または下の教科別リンクから開いてください。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                {subjects.map((subject) => (
                    <Button key={subject.id} asChild variant="outline">
                        <Link href={`${routeBase}?subjectId=${subject.id}`}>
                            問題一覧 - {subject.name}
                        </Link>
                    </Button>
                ))}
            </div>
        </div>
    );
}
