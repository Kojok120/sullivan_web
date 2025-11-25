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

    const { name, password } = result.data;

    const role = Role.STUDENT; // Force role to STUDENT for public signup

    // 2. Hash password
    const hashedPassword = await hashPassword(password);

    // 3. Create user
    try {
        // Generate a simple loginId for now, e.g., based on name or a UUID
        // For a real application, ensure loginId is unique and properly generated.
        const loginId = name.toLowerCase().replace(/\s/g, '') + Math.random().toString(36).substring(2, 8);

        await prisma.user.create({
            data: {
                loginId,
                password: hashedPassword,
                name,
                role,
            },
        });
        return { success: true, loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
