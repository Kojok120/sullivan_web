'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Trash2, Plus, School, Search } from 'lucide-react';
import { toast } from 'sonner';
import { createClassroom, deleteClassroom } from './actions';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ClassroomWithGroups } from '@/lib/types/classroom';
import { Badge } from '@/components/ui/badge';

type Classroom = ClassroomWithGroups & {
    createdAt: Date;
};

interface ClassroomListProps {
    initialClassrooms: Classroom[];
    searchQuery: string;
}

export function ClassroomList({ initialClassrooms, searchQuery }: ClassroomListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isCreating, setIsCreating] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [query, setQuery] = useState(searchQuery);

    async function handleCreate(formData: FormData) {
        setIsCreating(true);
        const result = await createClassroom(formData);
        setIsCreating(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('教室を追加しました');
            setIsDialogOpen(false);
            router.refresh();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('本当にこの教室を削除しますか？')) return;

        const result = await deleteClassroom(id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('教室を削除しました');
            router.refresh();
        }
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        const params = new URLSearchParams();
        if (query) {
            params.set('q', query);
        }
        router.push(`${pathname}?${params.toString()}`);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <form onSubmit={handleSearch} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="教室名を検索..."
                            className="pl-8"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <Button type="submit" className="min-h-11 sm:min-h-10">検索</Button>
                </form>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <School className="h-5 w-5" />
                                教室一覧
                            </CardTitle>
                            <CardDescription>
                                登録済みの教室一覧です。クリックして詳細を確認できます。
                            </CardDescription>
                        </div>
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="h-11 gap-1 sm:h-8">
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                        追加
                                    </span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>新規教室追加</DialogTitle>
                                    <DialogDescription>
                                        新しい教室を追加します。
                                    </DialogDescription>
                                </DialogHeader>
                                <form action={handleCreate} className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">教室名</Label>
                                        <Input
                                            id="name"
                                            name="name"
                                            placeholder="例: 足立校"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>プラン</Label>
                                        <div className="space-y-2 rounded-md border p-3">
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="radio"
                                                    name="plan"
                                                    value="STANDARD"
                                                    defaultChecked
                                                />
                                                <span>スタンダード</span>
                                            </label>
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="radio"
                                                    name="plan"
                                                    value="PREMIUM"
                                                />
                                                <span>プレミアム</span>
                                            </label>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" disabled={isCreating} className="min-h-11 sm:min-h-10">
                                            {isCreating ? '追加中...' : '追加'}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        {initialClassrooms.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                                教室が見つかりません
                            </div>
                        ) : (
                            <ul className="space-y-4">
                                {initialClassrooms.map((classroom) => (
                                    <li
                                        key={classroom.id}
                                        className="flex flex-col gap-3 rounded-md bg-muted/50 p-4 transition-colors hover:bg-muted/80 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <Link href={`/admin/classrooms/${classroom.id}`} className="flex-1">
                                            <div className="font-medium hover:underline flex items-center gap-2">
                                                {classroom.name}
                                                <Badge variant={classroom.plan === 'PREMIUM' ? 'default' : 'secondary'}>
                                                    {classroom.plan === 'PREMIUM' ? 'プレミアム' : 'スタンダード'}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1">
                                                {(classroom.groups || []).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {(classroom.groups || []).map((g, i) => (
                                                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                                                {g}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground/50">グループなし</span>
                                                )}
                                            </div>
                                        </Link>
                                        <div className="flex items-center gap-2 sm:ml-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive/90"
                                                onClick={() => handleDelete(classroom.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span className="ml-1 sm:ml-0 sm:sr-only">削除</span>
                                            </Button>
                                        </div>
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
