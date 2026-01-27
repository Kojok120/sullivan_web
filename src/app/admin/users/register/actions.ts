'use server';

import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    role: z.nativeEnum(Role),
    group: z.string().optional(),
    classroomId: z.string().optional(),
});

export async function signupAction(prevState: any, formData: FormData) {
    const rawData = {
        name: formData.get('name') as string,
        password: formData.get('password') as string,
        role: formData.get('role') as Role,
        group: formData.get('group') as string || undefined,
        classroomId: formData.get('classroomId') as string || undefined,
    };

    const result = signupSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { name, password, role, group, classroomId } = result.data;

    // 3. Register user using shared service
    try {
        const { registerUser } = await import('@/lib/user-registration-service');
        const regResult = await registerUser({
            name,
            password,
            role,
            group,
            classroomId
        });

        if (regResult.error || !regResult.user) {
            return { error: regResult.error };
        }

        return { success: true, loginId: regResult.user.loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
