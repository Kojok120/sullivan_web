import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export type PasswordServiceMessages = {
    currentPasswordRequired: string;
    newPasswordTooShort: string;
    confirmPasswordRequired: string;
    passwordsMismatch: string;
    updateFailed: string;
    userLoadFailed: string;
    currentPasswordIncorrect: string;
};

export const DEFAULT_PASSWORD_SERVICE_MESSAGES: PasswordServiceMessages = {
    currentPasswordRequired: '現在のパスワードを入力してください',
    newPasswordTooShort: '新しいパスワードは8文字以上で入力してください',
    confirmPasswordRequired: '確認用パスワードを入力してください',
    passwordsMismatch: '新しいパスワードが一致しません',
    updateFailed: 'パスワードの更新に失敗しました',
    userLoadFailed: 'ユーザー情報の取得に失敗しました。再ログインしてください。',
    currentPasswordIncorrect: '現在のパスワードが間違っています',
};

/**
 * 基本パスワードフィールドスキーマ（merge可能）
 */
export function createPasswordFieldsSchema(
    messages: Pick<PasswordServiceMessages, 'newPasswordTooShort' | 'confirmPasswordRequired'> = DEFAULT_PASSWORD_SERVICE_MESSAGES
) {
    return z.object({
        newPassword: z.string().min(8, messages.newPasswordTooShort),
        confirmPassword: z.string().min(1, messages.confirmPasswordRequired),
    });
}

export const passwordFieldsSchema = createPasswordFieldsSchema();

/**
 * パスワード一致バリデーション付きスキーマ
 */
export function createPasswordUpdateSchema(
    messages: Pick<PasswordServiceMessages, 'newPasswordTooShort' | 'confirmPasswordRequired' | 'passwordsMismatch'> = DEFAULT_PASSWORD_SERVICE_MESSAGES
) {
    return createPasswordFieldsSchema(messages).refine(
        (data) => data.newPassword === data.confirmPassword,
        {
            message: messages.passwordsMismatch,
            path: ['confirmPassword'],
        }
    );
}

export const passwordUpdateSchema = createPasswordUpdateSchema();

/**
 * Supabase Authのパスワードを更新し、isDefaultPasswordフラグをクリアする
 */
export async function updateUserPassword(
    newPassword: string,
    messages: Pick<PasswordServiceMessages, 'updateFailed'> = DEFAULT_PASSWORD_SERVICE_MESSAGES
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { isDefaultPassword: false }
    });

    if (error) {
        console.error('Password update error:', error);
        return { success: false, error: messages.updateFailed };
    }

    return { success: true };
}

/**
 * 現在のパスワードを検証する（設定ページ用）
 */
export async function verifyCurrentPassword(
    currentPassword: string,
    messages: Pick<PasswordServiceMessages, 'userLoadFailed' | 'currentPasswordIncorrect'> = DEFAULT_PASSWORD_SERVICE_MESSAGES
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
        return { success: false, error: messages.userLoadFailed };
    }

    // 現在のパスワードで再認証
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        return { success: false, error: messages.currentPasswordIncorrect };
    }

    return { success: true };
}
