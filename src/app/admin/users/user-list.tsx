'use client';

import { useState, useTransition } from 'react';
import { User, Role } from '@prisma/client';
import { createUser, updateUser, deleteUser } from '../actions';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal, Plus, Pencil, Trash2, Loader2, ArrowUpDown, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';

type UserWithGroup = User; // Group is now just a string field on User

interface Group {
    id: string;
    name: string;
}

interface UserListProps {
    initialUsers: UserWithGroup[];
    total: number;
    currentPage: number;
    limit: number;
    searchQuery: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    roleFilter?: Role;
    groupIdFilter?: string;
    groups: Group[];
    classrooms: { id: string; name: string; }[];
}

export function UserList({
    initialUsers,
    total,
    currentPage,
    limit,
    searchQuery,
    sortBy,
    sortOrder,
    roleFilter,
    groupIdFilter,
    groups,
    classrooms
}: UserListProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Dialog states
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserWithGroup | null>(null);

    // Form states
    const [formData, setFormData] = useState({
        name: '',
        role: 'STUDENT' as Role,
        password: '',
        groupId: '',
        classroomId: '',
    });

    // Search state
    const [search, setSearch] = useState(searchQuery);

    const updateParams = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams();
        if (searchQuery) params.set('q', searchQuery);
        if (currentPage > 1) params.set('page', currentPage.toString());
        if (sortBy) params.set('sortBy', sortBy);
        if (sortOrder) params.set('sortOrder', sortOrder);
        if (roleFilter) params.set('role', roleFilter);
        if (groupIdFilter) params.set('groupId', groupIdFilter);

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        // Reset page on filter/search change (except when page is explicitly updated)
        if (!updates.page && (updates.q !== undefined || updates.role !== undefined || updates.groupId !== undefined)) {
            params.set('page', '1');
        }

        router.push(`/admin/users?${params.toString()}`);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        updateParams({ q: search });
    };

    const handleSort = (column: string) => {
        const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
        updateParams({ sortBy: column, sortOrder: newOrder });
    };

    const handleRoleFilter = (role: string) => {
        updateParams({ role: role === 'ALL' ? undefined : role });
    };

    const handleGroupFilter = (groupId: string) => {
        updateParams({ groupId: groupId === 'ALL' ? undefined : groupId });
    };

    const handlePageChange = (newPage: number) => {
        updateParams({ page: newPage.toString() });
    };

    const handleAddUser = async () => {
        startTransition(async () => {
            const result = await createUser({
                name: formData.name,
                role: formData.role,
                password: formData.password || undefined,
                group: formData.groupId || undefined,
                classroomId: formData.classroomId || undefined,
            });

            if (result.success) {
                setIsAddOpen(false);
                setFormData({ name: '', role: 'STUDENT', password: '', groupId: '', classroomId: '' });
                router.refresh();
            } else {
                alert(result.error);
            }
        });
    };

    const handleEditUser = async () => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await updateUser(selectedUser.id, {
                name: formData.name,
                role: formData.role,
                password: formData.password || undefined,
                group: formData.groupId || undefined,
                classroomId: formData.classroomId || undefined,
            });

            if (result.success) {
                setIsEditOpen(false);
                setSelectedUser(null);
                setFormData({ name: '', role: 'STUDENT', password: '', groupId: '', classroomId: '' });
                router.refresh();
            } else {
                alert(result.error);
            }
        });
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await deleteUser(selectedUser.id);
            if (result.success) {
                setIsDeleteOpen(false);
                setSelectedUser(null);
                router.refresh();
            } else {
                alert(result.error);
            }
        });
    };

    const openEdit = (user: UserWithGroup) => {
        setSelectedUser(user);
        setFormData({
            name: user.name || '',
            role: user.role,
            password: '',
            groupId: user.group || '',
            classroomId: user.classroomId || '',
        });
        setIsEditOpen(true);
    };

    const openDelete = (user: UserWithGroup) => {
        setSelectedUser(user);
        setIsDeleteOpen(true);
    };

    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, total);
    const totalPages = Math.ceil(total / limit);

    const SortIcon = ({ column }: { column: string }) => {
        if (sortBy !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
        return <ArrowUpDown className={`ml-2 h-4 w-4 ${sortOrder === 'asc' ? 'text-primary' : 'text-primary/80'}`} />;
    };

    return (
        <div>
            <div className="flex flex-col space-y-4 mb-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">ユーザー一覧</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {total > 0 ? `${start}〜${end} / ${total}名表示中` : 'ユーザーが見つかりません'}
                        </p>
                    </div>
                    <Button onClick={() => setIsAddOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> 新規ユーザー
                    </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center bg-muted/30 p-4 rounded-lg">
                    <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
                        <Input
                            placeholder="名前またはIDで検索"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full sm:w-64 bg-background"
                        />
                        <Button type="submit" variant="secondary">検索</Button>
                    </form>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Select
                            value={roleFilter || 'ALL'}
                            onValueChange={handleRoleFilter}
                        >
                            <SelectTrigger className="w-[150px] bg-background">
                                <SelectValue placeholder="役割" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">全ての役割</SelectItem>
                                <SelectItem value="STUDENT">生徒</SelectItem>
                                <SelectItem value="TEACHER">講師</SelectItem>
                                <SelectItem value="PARENT">保護者</SelectItem>
                                <SelectItem value="ADMIN">管理者</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={groupIdFilter || 'ALL'}
                            onValueChange={handleGroupFilter}
                        >
                            <SelectTrigger className="w-[150px] bg-background">
                                <SelectValue placeholder="グループ" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">全てのグループ</SelectItem>
                                {groups.map((group) => (
                                    <SelectItem key={group.id} value={group.id}>
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('loginId')}>
                                <div className="flex items-center">ログインID <SortIcon column="loginId" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                                <div className="flex items-center">名前 <SortIcon column="name" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('role')}>
                                <div className="flex items-center">役割 <SortIcon column="role" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('group')}>
                                <div className="flex items-center">グループ <SortIcon column="group" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('createdAt')}>
                                <div className="flex items-center">作成日 <SortIcon column="createdAt" /></div>
                            </TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.loginId}</TableCell>
                                <TableCell>{user.name}</TableCell>
                                <TableCell>
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' :
                                        user.role === 'TEACHER' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'PARENT' ? 'bg-green-100 text-green-800' :
                                                'bg-blue-100 text-blue-800'
                                        }`}>
                                        {user.role}
                                    </span>
                                </TableCell>
                                <TableCell>{user.group || '-'}</TableCell>
                                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">メニューを開く</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => openEdit(user)}>
                                                <Pencil className="mr-2 h-4 w-4" /> 編集
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => openDelete(user)} className="text-red-600">
                                                <Trash2 className="mr-2 h-4 w-4" /> 削除
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center mt-6 gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                    >
                        前へ
                    </Button>
                    <div className="flex items-center px-4 text-sm">
                        {currentPage} / {totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                    >
                        次へ
                    </Button>
                </div>
            )}

            {/* Add User Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>新規ユーザー作成</DialogTitle>
                        <DialogDescription>
                            新しいユーザーアカウントを作成します。ログインIDは自動生成されます。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                名前
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="role" className="text-right">
                                役割
                            </Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value: Role) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="役割を選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STUDENT">生徒 (Student)</SelectItem>
                                    <SelectItem value="TEACHER">講師 (Teacher)</SelectItem>
                                    <SelectItem value="PARENT">保護者 (Parent)</SelectItem>
                                    <SelectItem value="ADMIN">管理者 (Admin)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="password" className="text-right">
                                パスワード
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="未入力で 'password123'"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="classroomId" className="text-right">
                                教室
                            </Label>
                            <Select
                                value={formData.classroomId}
                                onValueChange={(value) => setFormData({ ...formData, classroomId: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="教室を選択 (任意)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=" ">なし</SelectItem>
                                    {classrooms.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="groupId" className="text-right">
                                グループ
                            </Label>
                            <Select
                                value={formData.groupId}
                                onValueChange={(value) => setFormData({ ...formData, groupId: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="グループを選択 (任意)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=" ">なし</SelectItem>
                                    {groups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                            {group.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddOpen(false)}>キャンセル</Button>
                        <Button onClick={handleAddUser} disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            作成
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>ユーザー編集</DialogTitle>
                        <DialogDescription>
                            ユーザー情報を更新します。パスワードは変更する場合のみ入力してください。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-name" className="text-right">
                                名前
                            </Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-role" className="text-right">
                                役割
                            </Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value: Role) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="役割を選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STUDENT">生徒 (Student)</SelectItem>
                                    <SelectItem value="TEACHER">講師 (Teacher)</SelectItem>
                                    <SelectItem value="PARENT">保護者 (Parent)</SelectItem>
                                    <SelectItem value="ADMIN">管理者 (Admin)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-password" className="text-right">
                                パスワード
                            </Label>
                            <Input
                                id="edit-password"
                                type="password"
                                placeholder="変更しない場合は空欄"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-classroomId" className="text-right">
                                教室
                            </Label>
                            <Select
                                value={formData.classroomId}
                                onValueChange={(value) => setFormData({ ...formData, classroomId: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="教室を選択 (任意)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=" ">なし</SelectItem>
                                    {classrooms.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-groupId" className="text-right">
                                グループ
                            </Label>
                            <Select
                                value={formData.groupId}
                                onValueChange={(value) => setFormData({ ...formData, groupId: value })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="グループを選択 (任意)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=" ">なし</SelectItem>
                                    {groups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                            {group.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>キャンセル</Button>
                        <Button onClick={handleEditUser} disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            更新
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                            この操作は取り消せません。ユーザー <b>{selectedUser?.name}</b> ({selectedUser?.loginId}) を完全に削除します。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            削除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
