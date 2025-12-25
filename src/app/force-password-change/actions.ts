'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const updatePasswordSchema = z.object({
    newPassword: z.string().min(8, '新しいパスワードは8文字以上で入力してください'),
    confirmPassword: z.string().min(1, '確認用パスワードを入力してください'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: '新しいパスワードが一致しません',
    path: ['confirmPassword'],
});

export async function forceUpdatePassword(prevState: any, formData: FormData) {
    const rawData = {
        newPassword: formData.get('newPassword') as string,
        confirmPassword: formData.get('confirmPassword') as string,
    };

    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { newPassword } = result.data;

    const supabase = await createClient();

    // Update password and clear the isDefaultPassword flag
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { isDefaultPassword: false }
    });

    if (updateError) {
        console.error(updateError);
        return { error: 'パスワードの更新に失敗しました' };
    }

    redirect('/');
}
