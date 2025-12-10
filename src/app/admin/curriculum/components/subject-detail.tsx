'use client';

import { Subject, CoreProblem } from '@prisma/client';
import { CoreProblemList } from './core-problem-list';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createCoreProblem } from '../actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SubjectDetailProps {
    subject: Subject & { coreProblems: CoreProblem[] };
}

export function SubjectDetail({ subject }: SubjectDetailProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newCoreProblemName, setNewCoreProblemName] = useState('');
    const router = useRouter();

    const handleCreateCoreProblem = async () => {
        if (!newCoreProblemName) return;

        const result = await createCoreProblem({
            name: newCoreProblemName,
            subjectId: subject.id,
            order: subject.coreProblems.length + 1,
        });

        if (result.success) {
            toast.success('CoreProblemを作成しました');
            setIsCreateOpen(false);
            setNewCoreProblemName('');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold">{subject.name}</h2>
                    <p className="text-muted-foreground text-sm">
                        {subject.coreProblems.length} Core Problems
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> CoreProblem追加
                    </Button>
                </div>
            </div>

            <CoreProblemList
                subjectId={subject.id}
                coreProblems={subject.coreProblems}
                subjectName={subject.name}
            />

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>CoreProblem作成</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new-cp-name" className="text-right">名前</Label>
                            <Input
                                id="new-cp-name"
                                value={newCoreProblemName}
                                onChange={(e) => setNewCoreProblemName(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateCoreProblem}>作成</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
