'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { Role } from '@prisma/client';

import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    role: z.nativeEnum(Role),
});

export async function signupAction(prevState: any, formData: FormData) {
    const rawData = {
        name: formData.get('name') as string,
        password: formData.get('password') as string,
        role: formData.get('role') as Role,
    };

    const result = signupSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { name, password, role } = result.data;

    // 3. Create user using service to ensure consistent ID generation
    try {
        const { createUser } = await import('@/lib/user-service');
        const user = await createUser({
            name,
            password,
            role, // Use the role selected in UI
        });
        return { success: true, loginId: user.loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
