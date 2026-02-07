import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * 基本パスワードフィールドスキーマ（merge可能）
 */
export const passwordFieldsSchema = z.object({
    newPassword: z.string().min(8, '新しいパスワードは8文字以上で入力してください'),
    confirmPassword: z.string().min(1, '確認用パスワードを入力してください'),
});

/**
 * パスワード一致バリデーション付きスキーマ
 */
export const passwordUpdateSchema = passwordFieldsSchema.refine(
    (data) => data.newPassword === data.confirmPassword,
    {
        message: '新しいパスワードが一致しません',
        path: ['confirmPassword'],
    }
);

/**
 * Supabase Authのパスワードを更新し、isDefaultPasswordフラグをクリアする
 */
export async function updateUserPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { isDefaultPassword: false }
    });

    if (error) {
        console.error('Password update error:', error);
        return { success: false, error: 'パスワードの更新に失敗しました' };
    }

    return { success: true };
}

/**
 * 現在のパスワードを検証する（設定ページ用）
 */
export async function verifyCurrentPassword(currentPassword: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
        return { success: false, error: 'ユーザー情報の取得に失敗しました。再ログインしてください。' };
    }

    // 現在のパスワードで再認証
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        return { success: false, error: '現在のパスワードが間違っています' };
    }

    return { success: true };
}
