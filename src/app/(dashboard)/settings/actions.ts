'use server';

import { revalidatePath } from 'next/cache';
import {
    passwordFieldsSchema,
    updateUserPassword,
    verifyCurrentPassword
} from '@/lib/password-service';
import { z } from 'zod';

// 設定ページ用スキーマ（現在のパスワード必須）
const settingsPasswordSchema = z.object({
    currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
}).merge(passwordFieldsSchema).refine((data) => data.newPassword === data.confirmPassword, {
    message: '新しいパスワードが一致しません',
    path: ['confirmPassword'],
});

export async function updatePassword(prevState: any, formData: FormData) {
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
}

