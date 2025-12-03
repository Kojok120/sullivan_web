'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, Plus, School } from 'lucide-react';
import { toast } from 'sonner';
import { getClassrooms, createClassroom, deleteClassroom } from './actions';

interface Classroom {
    id: string;
    name: string;
    createdAt: Date;
}

export default function ClassroomsPage() {
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadClassrooms();
    }, []);

    async function loadClassrooms() {
        try {
            const data = await getClassrooms();
            // Convert date strings to Date objects if necessary, though server actions usually return Dates as is or strings depending on serialization.
            // Prisma returns Date objects, but Next.js server actions serialization might convert them.
            // Let's assume standard behavior and just set it.
            setClassrooms(data as any);
        } catch (error) {
            toast.error('教室一覧の取得に失敗しました');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCreate(formData: FormData) {
        setIsCreating(true);
        const result = await createClassroom(formData);
        setIsCreating(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('教室を追加しました');
            const form = document.getElementById('create-classroom-form') as HTMLFormElement;
            form.reset();
            loadClassrooms();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('本当にこの教室を削除しますか？')) return;

        const result = await deleteClassroom(id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('教室を削除しました');
            loadClassrooms();
        }
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">教室管理</h1>
                    <p className="text-muted-foreground">
                        教室の追加・削除を行います。
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            新規教室追加
                        </CardTitle>
                        <CardDescription>
                            新しい教室を追加します。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="create-classroom-form" action={handleCreate} className="flex gap-4">
                            <Input
                                name="name"
                                placeholder="教室名 (例: 足立校)"
                                required
                                className="flex-1"
                            />
                            <Button type="submit" disabled={isCreating}>
                                {isCreating ? '追加中...' : '追加'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <School className="h-5 w-5" />
                            教室一覧
                        </CardTitle>
                        <CardDescription>
                            登録済みの教室一覧です。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center py-4">読み込み中...</div>
                        ) : classrooms.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                                教室が登録されていません
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {classrooms.map((classroom) => (
                                    <li
                                        key={classroom.id}
                                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                                    >
                                        <span className="font-medium">{classroom.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive/90"
                                            onClick={() => handleDelete(classroom.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
