'use client';

import { CoreProblem } from '@prisma/client';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useEffect } from 'react';
import { reorderCoreProblems, createCoreProblem, deleteCoreProblem, updateCoreProblem, bulkDeleteCoreProblems } from '../actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GripVertical, Plus, Trash2, Pencil, Check, X, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

interface CoreProblemListProps {
    subjectId: string;
    coreProblems: CoreProblem[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}

interface SortableItemProps {
    coreProblem: CoreProblem;
    isSelected: boolean;
    isChecked: boolean;
    onSelect: () => void;
    onDeleteRequest: (id: string) => void;
    onCheckChange: (checked: boolean) => void;
}

function SortableCoreProblemItem({ coreProblem, isSelected, isChecked, onSelect, onDeleteRequest, onCheckChange }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: coreProblem.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(coreProblem.name);

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (editName.trim() === '') return;

        const result = await updateCoreProblem(coreProblem.id, { name: editName });
        if (result.success) {
            toast.success('更新しました');
            setIsEditing(false);
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div ref={setNodeRef} style={style} className="mb-2">
            <div
                className={cn(
                    "group flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors cursor-pointer",
                    isSelected && "bg-accent border-primary ring-1 ring-primary"
                )}
                onClick={() => !isEditing && onSelect()}
            >
                {/* Checkbox */}
                <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => onCheckChange(checked === true)}
                        className="mr-1"
                    />
                </div>

                {/* Drag Handle */}
                <div {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1">
                    <GripVertical className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <form onSubmit={handleSave} className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="h-7 text-sm"
                                autoFocus
                            />
                            <Button type="submit" size="icon" variant="ghost" className="h-7 w-7">
                                <Check className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditing(false)}>
                                <X className="h-3 w-3 text-red-600" />
                            </Button>
                        </form>
                    ) : (
                        <div className="font-medium text-sm truncate">{coreProblem.name}</div>
                    )}
                </div>

                {/* Actions */}
                {!isEditing && (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditName(coreProblem.name);
                                setIsEditing(true);
                            }}
                        >
                            <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest(coreProblem.id);
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function CoreProblemList({ subjectId, coreProblems, selectedId, onSelect }: CoreProblemListProps) {
    const [items, setItems] = useState(coreProblems);
    const [newName, setNewName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        setItems(coreProblems);
        // Clear checked items that no longer exist
        setCheckedIds(prev => {
            const existingIds = new Set(coreProblems.map(cp => cp.id));
            const newSet = new Set<string>();
            prev.forEach(id => {
                if (existingIds.has(id)) newSet.add(id);
            });
            return newSet;
        });
    }, [coreProblems]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((i) => i.id === active.id);
            const newIndex = items.findIndex((i) => i.id === over.id);

            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);

            const updates = newItems.map((item, index) => ({
                id: item.id,
                order: index + 1
            }));

            try {
                const res = await reorderCoreProblems(updates);
                if (res.error) toast.error(res.error);
            } catch (e) {
                toast.error('並び替えに失敗しました');
            }
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        const result = await createCoreProblem({
            name: newName,
            subjectId,
            order: items.length + 1,
        });

        if (result.success) {
            toast.success('作成しました');
            setNewName('');
        } else {
            toast.error(result.error);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;

        const id = deleteTarget;
        const wasSelected = id === selectedId;
        setDeleteTarget(null);
        setIsDeleting(true);

        try {
            const result = await deleteCoreProblem(id);
            if (result.success) {
                toast.success('削除しました');
                if (wasSelected) onSelect(null);
            } else {
                toast.error(result.error || '削除に失敗しました');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDeleteConfirm = async () => {
        const idsToDelete = Array.from(checkedIds);
        setShowBulkDeleteDialog(false);
        setIsDeleting(true);

        try {
            const result = await bulkDeleteCoreProblems(idsToDelete);
            if (result.success) {
                toast.success(`${result.count}件のコア問題を削除しました`);
                setCheckedIds(new Set());
                if (selectedId && idsToDelete.includes(selectedId)) {
                    onSelect(null);
                }
            } else {
                toast.error(result.error || '一括削除に失敗しました');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCheckChange = (id: string, checked: boolean) => {
        setCheckedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (checkedIds.size === items.length) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(items.map(i => i.id)));
        }
    };

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Bulk Actions Header */}
                {items.length > 0 && (
                    <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSelectAll}
                            className="h-7 text-xs"
                        >
                            {checkedIds.size === items.length ? (
                                <>
                                    <CheckSquare className="h-3 w-3 mr-1" />
                                    全解除
                                </>
                            ) : (
                                <>
                                    <Square className="h-3 w-3 mr-1" />
                                    全選択
                                </>
                            )}
                        </Button>
                        {checkedIds.size > 0 && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowBulkDeleteDialog(true)}
                                disabled={isDeleting}
                                className="h-7 text-xs"
                            >
                                <Trash2 className="h-3 w-3 mr-1" />
                                {checkedIds.size}件削除
                            </Button>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0">
                    <DndContext
                        id="core-problem-dnd"
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map((cp) => (
                                <SortableCoreProblemItem
                                    key={cp.id}
                                    coreProblem={cp}
                                    isSelected={cp.id === selectedId}
                                    isChecked={checkedIds.has(cp.id)}
                                    onSelect={() => onSelect(cp.id)}
                                    onDeleteRequest={setDeleteTarget}
                                    onCheckChange={(checked) => handleCheckChange(cp.id, checked)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Quick Add Footer */}
                <div className="pt-2 mt-2 border-t sticky bottom-0 bg-background">
                    <form onSubmit={handleCreate} className="flex gap-2">
                        <Input
                            placeholder="新しい単元/コア問題を追加..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="h-9 text-sm"
                        />
                        <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </div>

            {/* Single Delete Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>コア問題を削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                            紐づく問題も削除される可能性があります。この操作は取り消せません。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-500 hover:bg-red-600"
                            disabled={isDeleting}
                        >
                            削除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Dialog */}
            <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{checkedIds.size}件のコア問題を削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                            選択したコア問題と紐づく問題が削除される可能性があります。この操作は取り消せません。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDeleteConfirm}
                            className="bg-red-500 hover:bg-red-600"
                            disabled={isDeleting}
                        >
                            {checkedIds.size}件削除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
