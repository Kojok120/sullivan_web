'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, Plus, Users, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateClassroomGroups } from '../actions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface User {
    id: string;
    loginId: string;
    name: string | null;
    role: string;
    group: string | null;
}

interface Classroom {
    id: string;
    name: string;
    groups: string[];
    users: User[];
}

export function ClassroomDetail({ classroom }: { classroom: Classroom }) {
    const router = useRouter();
    const [groups, setGroups] = useState<string[]>(classroom.groups || []);
    const [newGroup, setNewGroup] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    async function handleSaveGroups() {
        setIsSaving(true);
        const result = await updateClassroomGroups(classroom.id, groups);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('グループを更新しました');
            router.refresh();
        }
    }

    function addGroup() {
        if (!newGroup.trim()) return;
        if (groups.includes(newGroup.trim())) {
            toast.error('このグループは既に追加されています');
            return;
        }
        setGroups([...groups, newGroup.trim()]);
        setNewGroup('');
    }

    function removeGroup(group: string) {
        setGroups(groups.filter(g => g !== group));
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/classrooms">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{classroom.name}</h1>
                    <p className="text-muted-foreground">教室の詳細情報と所属生徒の管理</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Group Management */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>グループ管理</CardTitle>
                        <CardDescription>
                            この教室のグループ（曜日など）を管理します。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="新しいグループ名"
                                value={newGroup}
                                onChange={(e) => setNewGroup(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addGroup();
                                    }
                                }}
                            />
                            <Button onClick={addGroup} size="icon" variant="secondary">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {groups.map((group) => (
                                <div
                                    key={group}
                                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                                >
                                    <span>{group}</span>
                                    <button
                                        onClick={() => removeGroup(group)}
                                        className="text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {groups.length === 0 && (
                                <span className="text-sm text-muted-foreground">グループがありません</span>
                            )}
                        </div>

                        <Button
                            onClick={handleSaveGroups}
                            disabled={isSaving}
                            className="w-full"
                        >
                            <Save className="mr-2 h-4 w-4" />
                            変更を保存
                        </Button>
                    </CardContent>
                </Card>

                {/* Student List */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            所属生徒 ({classroom.users.length}名)
                        </CardTitle>
                        <CardDescription>
                            この教室に所属している生徒の一覧です。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {classroom.users.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                所属している生徒はいません
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ログインID</TableHead>
                                        <TableHead>名前</TableHead>
                                        <TableHead>役割</TableHead>
                                        <TableHead>グループ</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {classroom.users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.loginId}</TableCell>
                                            <TableCell>{user.name || '-'}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                                        user.role === 'TEACHER' ? 'bg-purple-100 text-purple-800' :
                                                            user.role === 'PARENT' ? 'bg-green-100 text-green-800' :
                                                                'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {user.group ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                                        {user.group}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/teacher/students/${user.id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        詳細
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
