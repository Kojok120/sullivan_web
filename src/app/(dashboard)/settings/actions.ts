'use server';

import { revalidatePath } from 'next/cache';
import {
    passwordFieldsSchema,
    updateUserPassword,
    verifyCurrentPassword
} from '@/lib/password-service';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// 設定ページ用スキーマ（現在のパスワード必須）
const settingsPasswordSchema = z.object({
    currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
}).merge(passwordFieldsSchema).refine((data) => data.newPassword === data.confirmPassword, {
    message: '新しいパスワードが一致しません',
    path: ['confirmPassword'],
});

export async function updatePassword(_prevState: unknown, formData: FormData) {
    try {
        const session = await getSession();
        if (!session) {
            return { error: 'ログインが必要です' };
        }

        const allowedRoles = new Set(['STUDENT', 'TEACHER', 'HEAD_TEACHER', 'PARENT', 'ADMIN']);
        if (!allowedRoles.has(session.role)) {
            return { error: '権限がありません' };
        }

        const rawData = {
            currentPassword: formData.get('currentPassword') as string,
            newPassword: formData.get('newPassword') as string,
            confirmPassword: formData.get('confirmPassword') as string,
        };

        const result = settingsPasswordSchema.safeParse(rawData);

        if (!result.success) {
            return { error: result.error.errors[0].message };
        }

        const { currentPassword, newPassword } = result.data;

        // 現在のパスワードを検証
        const verifyResult = await verifyCurrentPassword(currentPassword);
        if (!verifyResult.success) {
            return { error: verifyResult.error };
        }

        // 新しいパスワードで更新
        const updateResult = await updateUserPassword(newPassword);
        if (!updateResult.success) {
            return { error: updateResult.error };
        }

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to update password in settings action:', error);
        return { error: 'パスワード更新に失敗しました' };
    }
}
