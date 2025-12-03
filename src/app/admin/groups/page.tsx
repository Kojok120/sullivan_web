'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getGroups, createGroup, deleteGroup } from './actions';

interface Group {
    id: string;
    name: string;
    createdAt: Date;
}

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadGroups();
    }, []);

    async function loadGroups() {
        try {
            const data = await getGroups();
            setGroups(data as any);
        } catch (error) {
            toast.error('グループ一覧の取得に失敗しました');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCreate(formData: FormData) {
        setIsCreating(true);
        const result = await createGroup(formData);
        setIsCreating(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('グループを追加しました');
            const form = document.getElementById('create-group-form') as HTMLFormElement;
            form.reset();
            loadGroups();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('本当にこのグループを削除しますか？')) return;

        const result = await deleteGroup(id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('グループを削除しました');
            loadGroups();
        }
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">グループ管理</h1>
                    <p className="text-muted-foreground">
                        グループの追加・削除を行います。
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            新規グループ追加
                        </CardTitle>
                        <CardDescription>
                            新しいグループを追加します。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="create-group-form" action={handleCreate} className="flex gap-4">
                            <Input
                                name="name"
                                placeholder="グループ名 (例: 木曜)"
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
                            <Users className="h-5 w-5" />
                            グループ一覧
                        </CardTitle>
                        <CardDescription>
                            登録済みのグループ一覧です。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center py-4">読み込み中...</div>
                        ) : groups.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                                グループが登録されていません
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {groups.map((group) => (
                                    <li
                                        key={group.id}
                                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                                    >
                                        <span className="font-medium">{group.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive/90"
                                            onClick={() => handleDelete(group.id)}
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
