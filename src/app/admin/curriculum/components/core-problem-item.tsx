'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CoreProblem } from '@prisma/client';
import { ProblemList } from './problem-list';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { deleteCoreProblem, updateCoreProblem } from '../actions';
import { toast } from 'sonner';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useRouter } from 'next/navigation';

interface CoreProblemItemProps {
    coreProblem: CoreProblem;
    sortableProps?: {
        ref: (node: HTMLElement | null) => void;
        style: React.CSSProperties;
        attributes: any;
        listeners: any;
    };
}

export function CoreProblemItem({ coreProblem, sortableProps }: CoreProblemItemProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [editName, setEditName] = useState(coreProblem.name);
    const router = useRouter();

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setIsDeleteDialogOpen(false);
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
            <AccordionItem
                value={coreProblem.id}
                className="border rounded px-4 bg-background"
                ref={sortableProps?.ref}
                style={sortableProps?.style}
            >
                <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-4 w-full pr-4">
                        {/* Drag Handle */}
                        {sortableProps && (
                            <div
                                {...sortableProps.attributes}
                                {...sortableProps.listeners}
                                className="cursor-grab hover:bg-muted p-1 rounded"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>
                            </div>
                        )}
                        <span className="font-medium text-sm">{coreProblem.name}</span>
                        <div className="ml-auto flex gap-2">
                            <Button
                                asChild
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }}
                            >
                                <div role="button" tabIndex={0}>
                                    <Pencil className="h-4 w-4" />
                                </div>
                            </Button>
                            <Button
                                asChild
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-500 hover:text-red-600 cursor-pointer"
                                onClick={handleDeleteClick}
                            >
                                <div role="button" tabIndex={0}>
                                    <Trash2 className="h-4 w-4" />
                                </div>
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

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>コア問題を削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                            含まれる問題も削除される可能性があります。この操作は取り消せません。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            削除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
