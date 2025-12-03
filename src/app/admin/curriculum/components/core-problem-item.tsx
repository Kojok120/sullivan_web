'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CoreProblem } from '@prisma/client';
import { ProblemList } from './problem-list';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil, Video } from 'lucide-react';
import { deleteCoreProblem, updateCoreProblem } from '../actions';
import { toast } from 'sonner';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useRouter } from 'next/navigation';

interface CoreProblemItemProps {
    coreProblem: CoreProblem;
}

export function CoreProblemItem({ coreProblem }: CoreProblemItemProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editName, setEditName] = useState(coreProblem.name);
    const router = useRouter();

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('本当に削除しますか？含まれる問題も削除される可能性があります。')) return;

        const result = await deleteCoreProblem(coreProblem.id);
        if (result.success) {
            toast.success('CoreProblemを削除しました');
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    const handleUpdate = async () => {
        const result = await updateCoreProblem(coreProblem.id, {
            name: editName,
        });
        if (result.success) {
            toast.success('CoreProblemを更新しました');
            setIsEditOpen(false);
            router.refresh();
        } else {
            toast.error('エラー', { description: result.error });
        }
    };

    return (
        <>
            <AccordionItem value={coreProblem.id} className="border rounded px-4 bg-background">
                <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-4 w-full pr-4">
                        <span className="font-medium text-sm">{coreProblem.name}</span>
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
                    <ProblemList coreProblemId={coreProblem.id} />
                </AccordionContent>
            </AccordionItem>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>CoreProblem編集</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-cp-name" className="text-right">名前</Label>
                            <Input
                                id="edit-cp-name"
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
