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
import { useTranslations } from 'next-intl';
import { reorderCoreProblems, createCoreProblem, deleteCoreProblem, updateCoreProblem, bulkDeleteCoreProblems } from '../actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GripVertical, Plus, Trash2, Pencil, X, CheckSquare, Square, Video } from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

type CoreProblemListTranslator = ReturnType<typeof useTranslations>;

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
    t: CoreProblemListTranslator;
}

function SortableCoreProblemItem({ coreProblem, isSelected, isChecked, onSelect, onDeleteRequest, onCheckChange, t }: SortableItemProps) {
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

    // 講義動画の編集ステート
    const [editVideos, setEditVideos] = useState<{ title: string; url: string }[]>([]);

    // 講義動画の配列（表示用）
    const lectureVideos = (coreProblem.lectureVideos as { title: string; url: string }[] | null) || [];

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (editName.trim() === '') return;

        // 空の動画エントリを除外
        const validVideos = editVideos.filter(v => v.title.trim() !== '' && v.url.trim() !== '');

        const result = await updateCoreProblem(coreProblem.id, {
            name: editName,
            lectureVideos: validVideos.length > 0 ? validVideos : undefined,
        });
        if (result.success) {
            toast.success(t('updateSuccess'));
            setIsEditing(false);
        } else {
            toast.error(result.error);
        }
    };

    const addVideo = () => {
        setEditVideos([...editVideos, { title: '', url: '' }]);
    };

    const removeVideo = (index: number) => {
        setEditVideos(editVideos.filter((_, i) => i !== index));
    };

    const updateVideo = (index: number, field: 'title' | 'url', value: string) => {
        const newVideos = [...editVideos];
        newVideos[index] = { ...newVideos[index], [field]: value };
        setEditVideos(newVideos);
    };

    return (
        <div ref={setNodeRef} style={style} className="mb-2">
            <div
                className={cn(
                    "group flex flex-col gap-2 p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors cursor-pointer",
                    isSelected && "bg-accent border-primary ring-1 ring-primary"
                )}
                onClick={() => !isEditing && onSelect()}
            >
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
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
                            <form onSubmit={handleSave} className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                    <Input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className="h-8 text-sm font-medium"
                                        placeholder={t('namePlaceholder')}
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2 pl-2 border-l-2 border-muted mt-1">
                                    <div className="text-xs font-semibold text-muted-foreground">{t('lectureVideosLabel')}</div>
                                    {editVideos.map((video, index) => (
                                        <div key={index} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                                            <Input
                                                value={video.title}
                                                onChange={e => updateVideo(index, 'title', e.target.value)}
                                                className="h-8 text-xs sm:w-1/3"
                                                placeholder={t('videoTitleEditPlaceholder')}
                                            />
                                            <Input
                                                value={video.url}
                                                onChange={e => updateVideo(index, 'url', e.target.value)}
                                                className="h-8 text-xs flex-1"
                                                placeholder={t('videoUrlYoutubePlaceholder')}
                                            />
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                                onClick={() => removeVideo(index)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addVideo}
                                        className="h-6 text-xs w-full"
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> {t('addVideo')}
                                    </Button>
                                </div>

                                <div className="flex items-center gap-2 justify-end mt-2">
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                                        {t('cancel')}
                                    </Button>
                                    <Button type="submit" size="sm" variant="default">
                                        {t('save')}
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <div>
                                <div className="font-medium text-sm truncate flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">#{coreProblem.masterNumber ?? '-'}</span>
                                    <span className="truncate">{coreProblem.name}</span>
                                </div>
                                {lectureVideos.length > 0 && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                        {lectureVideos.map((v, i) => (
                                            <div key={i} className="flex items-center gap-1 text-xs text-blue-600">
                                                <Video className="h-3 w-3" />
                                                <span className="truncate max-w-[150px]">{v.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    {!isEditing && (
                        <div className="flex items-center self-start opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditName(coreProblem.name);
                                    setEditVideos((coreProblem.lectureVideos as { title: string; url: string }[] | null) || []);
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
        </div>
    );
}

export function CoreProblemList({ subjectId, coreProblems, selectedId, onSelect }: CoreProblemListProps) {
    const t = useTranslations('AdminCurriculumCoreProblemList');
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

            const reordered = arrayMove(items, oldIndex, newIndex);
            const newItems = reordered.map((item, index) => ({
                ...item,
                order: index + 1,
                masterNumber: index + 1,
            }));
            setItems(newItems);

            const updates = newItems.map((item, index) => ({
                id: item.id,
                order: index + 1
            }));

            try {
                const res = await reorderCoreProblems(updates);
                if (res.error) toast.error(res.error);
            } catch {
                toast.error(t('reorderFailed'));
            }
        }
    };

    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newVideos, setNewVideos] = useState<{ title: string; url: string }[]>([]);

    const handleCreate = async () => {
        if (!newName.trim()) return;

        const validVideos = newVideos.filter(v => v.title.trim() !== '' && v.url.trim() !== '');

        const result = await createCoreProblem({
            name: newName,
            subjectId,
            lectureVideos: validVideos.length > 0 ? validVideos : undefined,
        });

        if (result.success) {
            toast.success(t('createSuccess'));
            setNewName('');
            setNewVideos([]);
            setIsCreateDialogOpen(false);
        } else {
            toast.error(result.error);
        }
    };

    const addNewVideo = () => {
        setNewVideos([...newVideos, { title: '', url: '' }]);
    };

    const removeNewVideo = (index: number) => {
        setNewVideos(newVideos.filter((_, i) => i !== index));
    };

    const updateNewVideo = (index: number, field: 'title' | 'url', value: string) => {
        const updated = [...newVideos];
        updated[index] = { ...updated[index], [field]: value };
        setNewVideos(updated);
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
                toast.success(t('deleteSuccess'));
                if (wasSelected) onSelect(null);
            } else {
                toast.error(result.error || t('deleteFailed'));
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
                toast.success(t('bulkDeleteSuccess', { count: result.count ?? 0 }));
                setCheckedIds(new Set());
                if (selectedId && idsToDelete.includes(selectedId)) {
                    onSelect(null);
                }
            } else {
                toast.error(result.error || t('bulkDeleteFailed'));
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
                    <div className="mb-2 flex flex-wrap items-center gap-2 border-b pb-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSelectAll}
                            className="min-h-11 text-xs sm:h-7 sm:min-h-0"
                        >
                            {checkedIds.size === items.length ? (
                                <>
                                    <CheckSquare className="h-3 w-3 mr-1" />
                                    {t('deselectAll')}
                                </>
                            ) : (
                                <>
                                    <Square className="h-3 w-3 mr-1" />
                                    {t('selectAll')}
                                </>
                            )}
                        </Button>
                        {checkedIds.size > 0 && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowBulkDeleteDialog(true)}
                                disabled={isDeleting}
                                className="min-h-11 text-xs sm:h-7 sm:min-h-0"
                            >
                                <Trash2 className="h-3 w-3 mr-1" />
                                {t('bulkDeleteButton', { count: checkedIds.size })}
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
                                    t={t}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Quick Add Footer */}
                <div className="pt-2 mt-2 border-t sticky bottom-0 bg-background">
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="flex min-h-11 w-full items-center justify-center gap-2 sm:min-h-10">
                                <Plus className="h-4 w-4" />
                                {t('addNewCoreProblem')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle>{t('createDialogTitle')}</DialogTitle>
                                <DialogDescription>
                                    {t('createDialogDescription')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('nameFieldLabel')}</label>
                                    <Input
                                        placeholder={t('nameExamplePlaceholder')}
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium">{t('lectureVideosLabel')}</label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={addNewVideo}
                                            className="h-6 text-xs"
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> {t('addButton')}
                                        </Button>
                                    </div>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
                                        {newVideos.length === 0 && (
                                            <div className="text-xs text-muted-foreground text-center py-2">
                                                {t('noVideos')}
                                            </div>
                                        )}
                                        {newVideos.map((video, index) => (
                                        <div key={index} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                                            <Input
                                                value={video.title}
                                                onChange={e => updateNewVideo(index, 'title', e.target.value)}
                                                    className="h-8 text-xs sm:w-1/3"
                                                    placeholder={t('videoTitlePlaceholder')}
                                                />
                                            <Input
                                                value={video.url}
                                                onChange={e => updateNewVideo(index, 'url', e.target.value)}
                                                    className="h-8 text-xs flex-1"
                                                    placeholder={t('videoUrlPlaceholder')}
                                                />
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                                    onClick={() => removeNewVideo(index)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" className="min-h-11 sm:min-h-10" onClick={() => setIsCreateDialogOpen(false)}>{t('cancel')}</Button>
                                <Button className="min-h-11 sm:min-h-10" onClick={handleCreate} disabled={!newName.trim()}>{t('createButton')}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Single Delete Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('deleteDialogDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-500 hover:bg-red-600"
                            disabled={isDeleting}
                        >
                            {t('deleteButton')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Dialog */}
            <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('bulkDeleteDialogTitle', { count: checkedIds.size })}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('bulkDeleteDialogDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDeleteConfirm}
                            className="bg-red-500 hover:bg-red-600"
                            disabled={isDeleting}
                        >
                            {t('bulkDeleteButton', { count: checkedIds.size })}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
