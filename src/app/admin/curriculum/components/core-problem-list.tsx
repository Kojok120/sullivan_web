'use client';

import { CoreProblem } from '@prisma/client';
import { Accordion } from '@/components/ui/accordion';
import { CoreProblemItem } from './core-problem-item';
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
import { reorderCoreProblems } from '../actions';
import { toast } from 'sonner';

import { CoreProblemBulkImport } from './core-problem-bulk-import';

interface CoreProblemListProps {
    subjectId: string;
    coreProblems: CoreProblem[];
    subjectName: string;
}

function SortableCoreProblemItem({ coreProblem, subjectName }: { coreProblem: CoreProblem, subjectName: string }) {
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

    return (
        <CoreProblemItem
            coreProblem={coreProblem}
            subjectName={subjectName}
            sortableProps={{
                ref: setNodeRef,
                style,
                attributes,
                listeners,
            }}
        />
    );
}

export function CoreProblemList({ subjectId, coreProblems, subjectName }: CoreProblemListProps) {
    const [items, setItems] = useState(coreProblems);

    useEffect(() => {
        setItems(coreProblems);
    }, [coreProblems]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((i) => i.id === active.id);
            const newIndex = items.findIndex((i) => i.id === over.id);

            // 1. Optimistic Update locally
            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);

            // 2. Trigger Server Action
            const updates = newItems.map((item, index) => ({
                id: item.id,
                order: index + 1
            }));

            try {
                const res = await reorderCoreProblems(updates);
                if (res.error) {
                    toast.error(res.error);
                    setItems(items); // Revert on specific error
                }
            } catch (e) {
                console.error(e);
                toast.error('並び替えに失敗しました');
                setItems(items); // Revert on exception
            }
        }
    };

    return (
        <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold text-muted-foreground">Core Problems</h4>
                <div className="flex gap-2">
                    <CoreProblemBulkImport subjectId={subjectId} />
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <Accordion type="single" collapsible className="space-y-2">
                    <SortableContext
                        items={items.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {items.map((cp) => (
                            <SortableCoreProblemItem
                                key={cp.id}
                                coreProblem={cp}
                                subjectName={subjectName}
                            />
                        ))}
                    </SortableContext>
                    {items.length === 0 && (
                        <div className="text-sm text-muted-foreground py-4">
                            CoreProblemがありません。右上のボタンから追加してください。
                        </div>
                    )}
                </Accordion>
            </DndContext>
        </div>
    );
}
