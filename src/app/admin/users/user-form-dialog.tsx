'use client';

import { useState, useTransition, useEffect } from 'react';
import { User, Role } from '@prisma/client';
import { createUser, updateUser } from '../actions';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

// Group is just a string field on User locally in list, but in form we treat as ID selection
interface Group {
    id: string;
    name: string;
}

interface Classroom {
    id: string;
    name: string;
}

// User type compatible with UserList
type UserWithGroup = User;

interface UserFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    user?: UserWithGroup | null;
    groups: Group[];
    classrooms: Classroom[];
    onSuccess: () => void;
}

export function UserFormDialog({
    open,
    onOpenChange,
    mode,
    user,
    groups,
    classrooms,
    onSuccess
}: UserFormDialogProps) {
    const [isPending, startTransition] = useTransition();

    const [formData, setFormData] = useState({
        name: '',
        role: 'STUDENT' as Role,
        password: '',
        groupId: '',
        classroomId: '',
    });

    // Reset or Populate form when opening
    useEffect(() => {
        if (open) {
            if (mode === 'edit' && user) {
                setFormData({
                    name: user.name || '',
                    role: user.role,
                    password: '', // Password always empty on edit init
                    groupId: user.group || '',
                    classroomId: user.classroomId || '',
                });
            } else {
                // Create mode defaults
                setFormData({
                    name: '',
                    role: 'STUDENT',
                    password: '',
                    groupId: '',
                    classroomId: '',
                });
            }
        }
    }, [open, mode, user]);

    const handleSubmit = async () => {
        startTransition(async () => {
            let result;
            if (mode === 'create') {
                result = await createUser({
                    name: formData.name,
                    role: formData.role,
                    password: formData.password || undefined,
                    group: formData.groupId || undefined,
                    classroomId: formData.classroomId || undefined,
                });
            } else {
                if (!user) return;
                result = await updateUser(user.id, {
                    name: formData.name,
                    role: formData.role,
                    password: formData.password || undefined,
                    group: formData.groupId || undefined,
                    classroomId: formData.classroomId || undefined,
                });
            }

            if (result.success) {
                onOpenChange(false);
                onSuccess();
            } else {
                alert(result.error);
            }
        });
    };

    const isEdit = mode === 'edit';
    const title = isEdit ? 'ユーザー編集' : '新規ユーザー作成';
    const description = isEdit
        ? 'ユーザー情報を更新します。パスワードは変更する場合のみ入力してください。'
        : '新しいユーザーアカウントを作成します。ログインIDは自動生成されます。';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">名前</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="role" className="text-right">役割</Label>
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
                        <Label htmlFor="password" className="text-right">パスワード</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder={isEdit ? "変更しない場合は空欄" : "未入力で 'password123'"}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="classroomId" className="text-right">教室</Label>
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
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="groupId" className="text-right">グループ</Label>
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
                                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEdit ? '更新' : '作成'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
