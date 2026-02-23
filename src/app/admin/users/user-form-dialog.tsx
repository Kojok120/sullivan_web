'use client';

import { useState, useTransition } from 'react';
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
import { NONE_SELECTION_VALUE, normalizeOptionalSelection } from '@/lib/form-selection';
import type { ClassroomOption, GroupOption } from '@/lib/types/classroom';
import { DEFAULT_INITIAL_PASSWORD } from '@/lib/auth-constants';
import { toast } from 'sonner';

type UserWithGroup = User;

interface UserFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    user?: UserWithGroup | null;
    groups: GroupOption[];
    classrooms: ClassroomOption[];
    onSuccess: () => void;
}

type UserFormState = {
    name: string;
    role: Role;
    groupId: string;
    classroomId: string;
};

function requiresClassroom(role: Role) {
    return role === 'STUDENT' || role === 'TEACHER' || role === 'HEAD_TEACHER';
}

function createInitialFormState(mode: 'create' | 'edit', user?: UserWithGroup | null): UserFormState {
    if (mode === 'edit' && user) {
        return {
            name: user.name || '',
            role: user.role,
            groupId: user.group || NONE_SELECTION_VALUE,
            classroomId: user.classroomId || NONE_SELECTION_VALUE,
        };
    }

    return {
        name: '',
        role: 'STUDENT',
        groupId: NONE_SELECTION_VALUE,
        classroomId: NONE_SELECTION_VALUE,
    };
}

function UserFormDialogContent({
    mode,
    user,
    groups,
    classrooms,
    onSuccess,
    onOpenChange,
}: Omit<UserFormDialogProps, 'open'>) {
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState<UserFormState>(() => createInitialFormState(mode, user));

    const handleSubmit = async () => {
        startTransition(async () => {
            let result;
            const normalizedGroup = normalizeOptionalSelection(formData.groupId);
            const normalizedClassroom = normalizeOptionalSelection(formData.classroomId);
            const classroomRequired = requiresClassroom(formData.role);

            if (classroomRequired && !normalizedClassroom) {
                toast.error('この役割では教室選択が必須です');
                return;
            }

            if (mode === 'create') {
                result = await createUser({
                    name: formData.name,
                    role: formData.role,
                    group: normalizedGroup,
                    classroomId: normalizedClassroom,
                });
            } else {
                if (!user) return;
                const nextGroup = formData.groupId === NONE_SELECTION_VALUE ? null : normalizedGroup;
                const nextClassroomId = formData.classroomId === NONE_SELECTION_VALUE ? null : normalizedClassroom;
                result = await updateUser(user.id, {
                    name: formData.name,
                    role: formData.role,
                    group: nextGroup,
                    classroomId: nextClassroomId,
                });
            }

            if (result.success) {
                onOpenChange(false);
                onSuccess();
                if ('warning' in result && typeof result.warning === 'string' && result.warning.length > 0) {
                    toast.warning(result.warning);
                }
            } else {
                toast.error(result.error || 'ユーザー操作に失敗しました');
            }
        });
    };

    const isEdit = mode === 'edit';
    const title = isEdit ? 'ユーザー編集' : '新規ユーザー作成';
    const description = isEdit
        ? 'ユーザー情報を更新します。パスワードは変更する場合のみ入力してください。'
        : '新しいユーザーアカウントを作成します。ログインIDは自動生成されます。';

    return (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="name" className="text-left sm:text-right">名前</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="sm:col-span-3"
                    />
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="role" className="text-left sm:text-right">役割</Label>
                    <Select
                        value={formData.role}
                        onValueChange={(value: Role) => setFormData({ ...formData, role: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder="役割を選択" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="STUDENT">生徒 (Student)</SelectItem>
                            <SelectItem value="TEACHER">講師 (Teacher)</SelectItem>
                            <SelectItem value="HEAD_TEACHER">校舎長 (Head Teacher)</SelectItem>
                            <SelectItem value="PARENT">保護者 (Parent)</SelectItem>
                            <SelectItem value="ADMIN">管理者 (Admin)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label className="text-left sm:text-right">初期パスワード</Label>
                    <div className="text-sm text-muted-foreground sm:col-span-3">
                        {isEdit ? 'パスワード変更は「パスワード変更」メニューから実行してください。' : (
                            <>新規作成時の初期パスワードは <code>{DEFAULT_INITIAL_PASSWORD}</code> です（初回変更必須）。</>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="classroomId" className="text-left sm:text-right">教室</Label>
                    <Select
                        value={formData.classroomId}
                        onValueChange={(value) => setFormData({ ...formData, classroomId: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder={requiresClassroom(formData.role) ? "教室を選択 (必須)" : "教室を選択 (任意)"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE_SELECTION_VALUE}>なし</SelectItem>
                            {classrooms.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="groupId" className="text-left sm:text-right">グループ</Label>
                    <Select
                        value={formData.groupId}
                        onValueChange={(value) => setFormData({ ...formData, groupId: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder="グループを選択 (任意)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE_SELECTION_VALUE}>なし</SelectItem>
                            {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11 sm:min-h-10">キャンセル</Button>
                <Button onClick={handleSubmit} disabled={isPending} className="min-h-11 sm:min-h-10">
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEdit ? '更新' : '作成'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

export function UserFormDialog({
    open,
    onOpenChange,
    mode,
    user,
    groups,
    classrooms,
    onSuccess,
}: UserFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && (
                <UserFormDialogContent
                    key={mode === 'edit' ? `edit-${user?.id ?? 'none'}` : 'create'}
                    mode={mode}
                    user={user}
                    groups={groups}
                    classrooms={classrooms}
                    onSuccess={onSuccess}
                    onOpenChange={onOpenChange}
                />
            )}
        </Dialog>
    );
}
