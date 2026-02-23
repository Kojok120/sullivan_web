'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, Plus, Users, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateClassroomGroups, updateClassroomPlan } from '../actions';
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
import { RoleBadge } from '@/components/ui/role-badge';
import type { ClassroomWithUsers } from '@/lib/types/classroom';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export function ClassroomDetail({
    classroom,
    canEditPlan,
}: {
    classroom: ClassroomWithUsers;
    canEditPlan: boolean;
}) {
    const router = useRouter();
    const [groups, setGroups] = useState<string[]>(classroom.groups || []);
    const [newGroup, setNewGroup] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [plan, setPlan] = useState<'STANDARD' | 'PREMIUM'>(classroom.plan);
    const [isPlanSaving, setIsPlanSaving] = useState(false);

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

    async function handleSavePlan() {
        setIsPlanSaving(true);
        const result = await updateClassroomPlan(classroom.id, plan);
        setIsPlanSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('プランを更新しました');
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
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                <Link href="/admin/classrooms">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{classroom.name}</h1>
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
                        <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">教室プラン</span>
                                <Badge variant={plan === 'PREMIUM' ? 'default' : 'secondary'}>
                                    {plan === 'PREMIUM' ? 'プレミアム' : 'スタンダード'}
                                </Badge>
                            </div>
                            <Select
                                value={plan}
                                onValueChange={(value: 'STANDARD' | 'PREMIUM') => setPlan(value)}
                                disabled={!canEditPlan}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="プランを選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STANDARD">スタンダード</SelectItem>
                                    <SelectItem value="PREMIUM">プレミアム</SelectItem>
                                </SelectContent>
                            </Select>
                            {canEditPlan && (
                                <Button
                                    onClick={handleSavePlan}
                                    disabled={isPlanSaving}
                                    variant="secondary"
                                    className="min-h-11 w-full sm:min-h-10"
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    プランを保存
                                </Button>
                            )}
                        </div>

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
                            <Button onClick={addGroup} size="icon" variant="secondary" className="h-11 w-11 sm:h-10 sm:w-10">
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
                            className="min-h-11 w-full sm:min-h-10"
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
                            <>
                                <div className="space-y-3 md:hidden">
                                    {classroom.users.map((user) => (
                                        <div key={user.id} className="rounded-lg border bg-card p-4">
                                            <div className="mb-2 flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold">{user.name || '-'}</p>
                                                    <p className="text-xs text-muted-foreground">{user.loginId}</p>
                                                </div>
                                                <RoleBadge role={user.role} />
                                            </div>
                                            <div className="mb-3 text-sm">
                                                <p className="text-xs text-muted-foreground">グループ</p>
                                                {user.group ? (
                                                    <span className="mt-1 inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                        {user.group}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </div>
                                            <Button asChild variant="outline" size="sm" className="min-h-11 w-full">
                                                <Link href={`/teacher/students/${user.id}`}>
                                                    詳細
                                                </Link>
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                <div className="hidden md:block">
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
                                                        <RoleBadge role={user.role} />
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
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
