'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Unit, CoreProblem } from '@prisma/client';
import { CoreProblemList } from './core-problem-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { deleteUnit, updateUnit } from '../actions';
import { toast } from 'sonner';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useRouter } from 'next/navigation';

interface UnitItemProps {
    unit: Unit & { coreProblems: CoreProblem[] };
}

export function UnitItem({ unit }: UnitItemProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editName, setEditName] = useState(unit.name);
    const router = useRouter();

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
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
        <>
            <AccordionItem value={unit.id} className="border rounded px-4 bg-card">
                <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-4 w-full pr-4">
                        <span className="font-medium">{unit.name}</span>
                        <Badge variant="outline">{unit.coreProblems.length} Core Problems</Badge>
                        <div className="ml-auto flex gap-2">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-500 hover:text-red-600"
                                onClick={handleDelete}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                    <CoreProblemList unitId={unit.id} coreProblems={unit.coreProblems} />
                </AccordionContent>
            </AccordionItem>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unit編集</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-name" className="text-right">名前</Label>
                            <Input
                                id="edit-name"
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
        </>
    );
}
