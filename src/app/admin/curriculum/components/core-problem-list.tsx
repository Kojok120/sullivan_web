'use client';

import { CoreProblem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { CoreProblemItem } from './core-problem-item';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createCoreProblem } from '../actions';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useRouter } from 'next/navigation';

interface CoreProblemListProps {
    unitId: string;
    coreProblems: CoreProblem[];
}

export function CoreProblemList({ unitId, coreProblems }: CoreProblemListProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const router = useRouter();

    const handleCreate = async () => {
        if (!newName.trim()) return;

        const maxOrder = coreProblems.length > 0 ? Math.max(...coreProblems.map(cp => cp.order)) : 0;
        const result = await createCoreProblem({
            name: newName,
            unitId,
            order: maxOrder + 1,
        });

        if (result.success) {
            toast.success('CoreProblemを作成しました');
            setIsCreateOpen(false);
            setNewName('');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold text-muted-foreground">Core Problems</h4>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" /> 追加</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>新規CoreProblem作成</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="cp-name" className="text-right">名前</Label>
                                <Input
                                    id="cp-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="col-span-3"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate}>作成</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Accordion type="single" collapsible className="space-y-2">
                {coreProblems.map((cp) => (
                    <CoreProblemItem key={cp.id} coreProblem={cp} />
                ))}
            </Accordion>
        </div>
    );
}
