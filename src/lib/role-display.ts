import type { Role } from '@prisma/client';

const ROLE_LABELS: Record<Role, string> = {
    STUDENT: '生徒',
    TEACHER: '講師',
    HEAD_TEACHER: '校舎長',
    PARENT: '保護者',
    ADMIN: '管理者',
    MATERIAL_AUTHOR: '問題作成者(M)',
};

export function getRoleLabel(role: Role | string | null | undefined): string {
    if (!role) return '不明';
    return ROLE_LABELS[role as Role] ?? String(role);
}

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = (Object.entries(ROLE_LABELS) as Array<[Role, string]>)
    .map(([value, label]) => ({ value, label }));
