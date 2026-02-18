'use server';

// Removed unused imports
import { redirect } from 'next/navigation';

import { z } from 'zod';

const loginSchema = z.object({
    loginId: z.string().min(1, 'IDを入力してください'),
    password: z.string().min(1, 'パスワードを入力してください'),
});

export async function loginAction(_prevState: unknown, formData: FormData) {
    const rawData = {
        loginId: formData.get('loginId') as string,
        password: formData.get('password') as string,
    };

    const result = loginSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { loginId, password } = result.data;
    const email = `${loginId}@sullivan-internal.local`;

    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { error: 'IDまたはパスワードが間違っています' };
    }

    // signInWithPasswordの戻り値からuserを取得（二重呼び出し削減）
    const role = data.user?.app_metadata?.role || 'STUDENT';

    if (role === 'ADMIN') {
        redirect('/admin');
    } else if (role === 'TEACHER') {
        redirect('/teacher');
    } else {
        redirect('/');
    }
}
