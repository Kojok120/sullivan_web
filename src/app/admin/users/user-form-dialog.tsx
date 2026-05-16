'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
import { ROLE_OPTIONS } from '@/lib/role-display';

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
    const t = useTranslations('AdminUserFormDialog');
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState<UserFormState>(() => createInitialFormState(mode, user));

    const handleSubmit = async () => {
        startTransition(async () => {
            let result;
            const normalizedGroup = normalizeOptionalSelection(formData.groupId);
            const normalizedClassroom = normalizeOptionalSelection(formData.classroomId);
            const classroomRequired = requiresClassroom(formData.role);

            if (classroomRequired && !normalizedClassroom) {
                toast.error(t('classroomRequired'));
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
                toast.error(result.error || t('operationFailed'));
            }
        });
    };

    const isEdit = mode === 'edit';
    const title = isEdit ? t('editTitle') : t('createTitle');
    const description = isEdit
        ? t('editDescription')
        : t('createDescription');

    return (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="name" className="text-left sm:text-right">{t('nameLabel')}</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="sm:col-span-3"
                    />
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="role" className="text-left sm:text-right">{t('roleLabel')}</Label>
                    <Select
                        value={formData.role}
                        onValueChange={(value: Role) => setFormData({ ...formData, role: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder={t('rolePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {ROLE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label className="text-left sm:text-right">{t('initialPasswordLabel')}</Label>
                    <div className="text-sm text-muted-foreground sm:col-span-3">
                        {isEdit ? t('passwordEditNote') : (
                            <>{t('passwordCreatePrefix')} <code>{DEFAULT_INITIAL_PASSWORD}</code> {t('passwordCreateSuffix')}</>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="classroomId" className="text-left sm:text-right">{t('classroomLabel')}</Label>
                    <Select
                        value={formData.classroomId}
                        onValueChange={(value) => setFormData({ ...formData, classroomId: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder={requiresClassroom(formData.role) ? t('classroomRequiredPlaceholder') : t('classroomOptionalPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE_SELECTION_VALUE}>{t('none')}</SelectItem>
                            {classrooms.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
                    <Label htmlFor="groupId" className="text-left sm:text-right">{t('groupLabel')}</Label>
                    <Select
                        value={formData.groupId}
                        onValueChange={(value) => setFormData({ ...formData, groupId: value })}
                    >
                        <SelectTrigger className="sm:col-span-3">
                            <SelectValue placeholder={t('groupPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE_SELECTION_VALUE}>{t('none')}</SelectItem>
                            {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11 sm:min-h-10">{t('cancel')}</Button>
                <Button onClick={handleSubmit} disabled={isPending} className="min-h-11 sm:min-h-10">
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEdit ? t('update') : t('create')}
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
