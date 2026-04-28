'use client';

import { useState, useTransition } from 'react';
import { User, Role } from '@prisma/client';
import { deleteUser } from '../actions';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal, Pencil, Trash2, Loader2, Filter, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserFormDialog } from './user-form-dialog';
import { PasswordResetDialog } from './password-reset-dialog';
import { RoleBadge } from '@/components/ui/role-badge';
import { DateDisplay } from '@/components/ui/date-display';
import { SortIcon } from '@/components/ui/sort-icon';
import type { ClassroomOption, GroupOption } from '@/lib/types/classroom';
import { ROLE_OPTIONS } from '@/lib/role-display';

type UserWithClassroom = User & {
    classroom?: {
        name: string;
    } | null;
};

interface UserListProps {
    initialUsers: UserWithClassroom[];
    total: number;
    currentPage: number;
    limit: number;
    searchQuery: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    roleFilter?: Role;
    classroomIdFilter?: string;
    groups: GroupOption[];
    classrooms: ClassroomOption[];
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
    classroomIdFilter,
    groups,
    classrooms
}: UserListProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Dialog states
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserWithClassroom | null>(null);

    // Search state
    const [search, setSearch] = useState(searchQuery);

    const updateParams = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams();
        if (searchQuery) params.set('q', searchQuery);
        if (currentPage > 1) params.set('page', currentPage.toString());
        if (sortBy) params.set('sortBy', sortBy);
        if (sortOrder) params.set('sortOrder', sortOrder);
        if (roleFilter) params.set('role', roleFilter);
        if (classroomIdFilter) params.set('classroomId', classroomIdFilter);

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        // Reset page on filter/search change (except when page is explicitly updated)
        if (!updates.page && (updates.q !== undefined || updates.role !== undefined || updates.classroomId !== undefined)) {
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

    const handleClassroomFilter = (classroomId: string) => {
        updateParams({ classroomId: classroomId === 'ALL' ? undefined : classroomId });
    };

    const handlePageChange = (newPage: number) => {
        updateParams({ page: newPage.toString() });
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

    const openEdit = (user: UserWithClassroom) => {
        setSelectedUser(user);
        setIsEditOpen(true);
    };

    const openDelete = (user: UserWithClassroom) => {
        setSelectedUser(user);
        setIsDeleteOpen(true);
    };

    const openPasswordReset = (user: UserWithClassroom) => {
        setSelectedUser(user);
        setIsPasswordResetOpen(true);
    };

    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, total);
    const totalPages = Math.ceil(total / limit);

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
                </div>

                <div className="flex flex-col gap-4 rounded-lg bg-muted/30 p-4 sm:flex-row sm:items-center">
                    <form onSubmit={handleSearch} className="flex w-full gap-2 sm:w-auto">
                        <Input
                            placeholder="名前またはIDで検索"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full sm:w-64 bg-background"
                        />
                        <Button type="submit" variant="secondary">検索</Button>
                    </form>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Select
                            value={roleFilter || 'ALL'}
                            onValueChange={handleRoleFilter}
                        >
                            <SelectTrigger className="w-full bg-background sm:w-[150px]">
                                <SelectValue placeholder="役割" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">全ての役割</SelectItem>
                                {ROLE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={classroomIdFilter || 'ALL'}
                            onValueChange={handleClassroomFilter}
                        >
                            <SelectTrigger className="w-full bg-background sm:w-[150px]">
                                <SelectValue placeholder="教室" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">全ての教室</SelectItem>
                                {classrooms.map((classroom) => (
                                    <SelectItem key={classroom.id} value={classroom.id}>
                                        {classroom.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="space-y-3 md:hidden">
                {initialUsers.length === 0 ? (
                    <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">
                        ユーザーが見つかりません
                    </div>
                ) : (
                    initialUsers.map((user) => (
                        <div key={user.id} className="rounded-lg border bg-white p-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-base font-semibold">{user.name || '-'}</p>
                                    <p className="text-xs text-muted-foreground">{user.loginId}</p>
                                </div>
                                <RoleBadge role={user.role} />
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">教室</p>
                                    <p>{user.classroom?.name || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">作成日</p>
                                    <p><DateDisplay date={user.createdAt} /></p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" className="min-h-11" onClick={() => openEdit(user)}>
                                    <Pencil className="mr-1 h-4 w-4" />
                                    編集
                                </Button>
                                <Button variant="outline" size="sm" className="min-h-11" onClick={() => openPasswordReset(user)}>
                                    <KeyRound className="mr-1 h-4 w-4" />
                                    PW
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="col-span-2 min-h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => openDelete(user)}
                                >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    削除
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="hidden rounded-md border bg-white md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('loginId')}>
                                <div className="flex items-center">
                                    ログインID
                                    <SortIcon active={sortBy === 'loginId'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                                <div className="flex items-center">
                                    名前
                                    <SortIcon active={sortBy === 'name'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('role')}>
                                <div className="flex items-center">
                                    役割
                                    <SortIcon active={sortBy === 'role'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('classroom')}>
                                <div className="flex items-center">
                                    教室
                                    <SortIcon active={sortBy === 'classroom'} sortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('createdAt')}>
                                <div className="flex items-center">
                                    作成日
                                    <SortIcon active={sortBy === 'createdAt'} sortOrder={sortOrder} />
                                </div>
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
                                    <RoleBadge role={user.role} />
                                </TableCell>
                                <TableCell>{user.classroom?.name || '-'}</TableCell>
                                <TableCell>
                                    <DateDisplay date={user.createdAt} />
                                </TableCell>
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
                                            <DropdownMenuItem onClick={() => openPasswordReset(user)}>
                                                <KeyRound className="mr-2 h-4 w-4" /> パスワード変更
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

            <UserFormDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                mode="edit"
                user={selectedUser}
                groups={groups}
                classrooms={classrooms}
                onSuccess={() => router.refresh()}
            />

            {/* Password Reset Dialog */}
            {selectedUser && (
                <PasswordResetDialog
                    open={isPasswordResetOpen}
                    onOpenChange={setIsPasswordResetOpen}
                    userId={selectedUser.id}
                    userName={selectedUser.name || ''}
                    loginId={selectedUser.loginId}
                />
            )}

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
