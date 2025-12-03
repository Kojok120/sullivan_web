'use client';

import { Unit, CoreProblem } from '@prisma/client';
import { CoreProblemList } from './core-problem-list';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { updateUnit, deleteUnit } from '../actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UnitDetailProps {
    unit: Unit & { coreProblems: CoreProblem[] };
    subjectName: string;
}

export function UnitDetail({ unit, subjectName }: UnitDetailProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editName, setEditName] = useState(unit.name);
    const router = useRouter();

    // Reset edit name when unit changes
    if (editName !== unit.name && !isEditOpen) {
        setEditName(unit.name);
    }

    const handleDelete = async () => {
        if (!confirm('本当に削除しますか？含まれるCoreProblemも削除される可能性があります。')) return;

        const result = await deleteUnit(unit.id);
        if (result.success) {
            toast.success('Unitを削除しました');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    const handleUpdate = async () => {
        const result = await updateUnit(unit.id, { name: editName });
        if (result.success) {
            toast.success('Unitを更新しました');
            setIsEditOpen(false);
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold">{unit.name}</h2>
                    <p className="text-muted-foreground text-sm">
                        {unit.coreProblems.length} Core Problems
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                        <Pencil className="mr-2 h-4 w-4" /> 編集
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" /> 削除
                    </Button>
                </div>
            </div>

            <CoreProblemList unitId={unit.id} coreProblems={unit.coreProblems} subjectName={subjectName} />

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unit編集</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-unit-name" className="text-right">名前</Label>
                            <Input
                                id="edit-unit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdate}>更新</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
