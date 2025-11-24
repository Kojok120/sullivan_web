'use client';

import { Problem, CoreProblem, Unit, Subject, ProblemType } from '@prisma/client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpCircle } from 'lucide-react';
import { updateProblemType } from './actions';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type ProblemWithRelations = Problem & {
    coreProblem: CoreProblem & {
        unit: Unit & {
            subject: Subject;
        };
    };
};

interface PrereqManagerProps {
    problems: ProblemWithRelations[];
}

export function PrereqManager({ problems }: PrereqManagerProps) {
    const [query, setQuery] = useState('');
    const [filterPrereq, setFilterPrereq] = useState(false);

    const filtered = problems.filter(p => {
        const matchesQuery =
            p.question.includes(query) ||
            p.coreProblem.name.includes(query) ||
            p.coreProblem.unit.name.includes(query);
        const matchesType = filterPrereq ? p.type === 'PREREQ' : true;
        return matchesQuery && matchesType;
    });

    const handleToggle = async (id: string, currentType: ProblemType) => {
        const newType = currentType === 'NORMAL' ? 'PREREQ' : 'NORMAL';
        const result = await updateProblemType(id, newType);
        if (result.success) {
            toast.success(`タイプを${newType}に変更しました`);
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="検索..."
                        className="pl-8"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <Button
                    variant={filterPrereq ? "secondary" : "outline"}
                    onClick={() => setFilterPrereq(!filterPrereq)}
                >
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Prereqのみ
                </Button>
            </div>

            <div className="grid gap-4">
                {filtered.map((p) => (
                    <Card key={p.id}>
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline">{p.coreProblem.unit.subject.name}</Badge>
                                    <span className="text-xs text-muted-foreground">{p.coreProblem.unit.name} &gt; {p.coreProblem.name}</span>
                                </div>
                                <div className="font-medium text-sm">{p.question}</div>
                                <div className="text-xs text-muted-foreground mt-1">解答: {p.answer}</div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`type-${p.id}`}
                                    checked={p.type === 'PREREQ'}
                                    onCheckedChange={() => handleToggle(p.id, p.type)}
                                />
                                <Label htmlFor={`type-${p.id}`} className="w-16 font-medium">
                                    {p.type === 'PREREQ' ? 'Prereq' : 'Normal'}
                                </Label>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        条件に一致する問題が見つかりません
                    </div>
                )}
            </div>
        </div>
    );
}
