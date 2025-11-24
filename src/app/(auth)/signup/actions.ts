'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { Role } from '@prisma/client';

export async function signupAction(prevState: any, formData: FormData) {
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as Role;

    if (!name || !password || !role) {
        return { error: 'すべての項目を入力してください' };
    }

    try {
        const { createUser } = await import('@/lib/user-service');
        const user = await createUser({
            name,
            role,
            password,
        });

        return { success: true, loginId: user.loginId };
    } catch (e) {
        console.error(e);
        return { error: '登録に失敗しました。もう一度お試しください。' };
    }
}
