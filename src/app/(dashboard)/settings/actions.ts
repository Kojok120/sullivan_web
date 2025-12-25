'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const updatePasswordSchema = z.object({
    currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
    newPassword: z.string().min(8, '新しいパスワードは8文字以上で入力してください'),
    confirmPassword: z.string().min(1, '確認用パスワードを入力してください'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: '新しいパスワードが一致しません',
    path: ['confirmPassword'],
});

export async function updatePassword(prevState: any, formData: FormData) {
    const rawData = {
        currentPassword: formData.get('currentPassword') as string,
        newPassword: formData.get('newPassword') as string,
        confirmPassword: formData.get('confirmPassword') as string,
    };

    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { currentPassword, newPassword } = result.data;

    const supabase = await createClient();

    // 1. Verify current password by signing in (Supabase doesn't have a simple "verify password" without sign in?)
    // Actually, updateAuthenticatedUser doesn't require current password if session is valid?
    // BUT for security, we typically want to re-authenticate or check old password.
    // However, `supabase.auth.updateUser` allows changing password if you have a session.
    // It's a common practice to ask for "current password" in the UI to prevent session hijacking changes,
    // but enforcing it via Supabase requires us to try to signIn with the current user's email/password first.

    // Get current user email
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
        return { error: 'ユーザー情報の取得に失敗しました。再ログインしてください。' };
    }

    // Try to sign in with current password to verify identity
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        return { error: '現在のパスワードが間違っています' };
    }

    // If verified, update the password and clear default flag
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { isDefaultPassword: false }
    });

    if (updateError) {
        console.error(updateError);
        return { error: 'パスワードの更新に失敗しました' };
    }

    revalidatePath('/settings');
    return { success: true };
}
