'use client';

import { Unit, CoreProblem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { UnitItem } from './unit-item';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createUnit } from '../actions';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useRouter } from 'next/navigation';

interface UnitListProps {
    subjectId: string;
    units: (Unit & { coreProblems: CoreProblem[] })[];
}

export function UnitList({ subjectId, units }: UnitListProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUnitName, setNewUnitName] = useState('');
    const router = useRouter();

    const handleCreateUnit = async () => {
        if (!newUnitName.trim()) return;

        const maxOrder = units.length > 0 ? Math.max(...units.map(u => u.order)) : 0;
        const result = await createUnit({
            name: newUnitName,
            subjectId,
            order: maxOrder + 1,
        });

        if (result.success) {
            toast.success('Unitを作成しました');
            setIsCreateOpen(false);
            setNewUnitName('');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-muted-foreground">Units</h3>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" /> Unit追加</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>新規Unit作成</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">名前</Label>
                                <Input
                                    id="name"
                                    value={newUnitName}
                                    onChange={(e) => setNewUnitName(e.target.value)}
                                    className="col-span-3"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateUnit}>作成</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Accordion type="single" collapsible className="space-y-2">
                {units.map((unit) => (
                    <UnitItem key={unit.id} unit={unit} />
                ))}
            </Accordion>
        </div>
    );
}
