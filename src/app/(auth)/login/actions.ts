'use server';

import { prisma } from '@/lib/prisma';
import { login, verifyPassword } from '@/lib/auth';
import { redirect } from 'next/navigation';

import { z } from 'zod';

const loginSchema = z.object({
    loginId: z.string().min(1, 'IDを入力してください'),
    password: z.string().min(1, 'パスワードを入力してください'),
});

export async function loginAction(prevState: any, formData: FormData) {
    const rawData = {
        loginId: formData.get('loginId') as string,
        password: formData.get('password') as string,
    };

    const result = loginSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { loginId, password } = result.data;

    const user = await prisma.user.findUnique({
        where: { loginId },
    });

    if (!user || !(await verifyPassword(password, user.password))) {
        return { error: 'IDまたはパスワードが間違っています' };
    }

    await login({
        userId: user.id,
        name: user.name || '',
        role: user.role,
    });

    if (user.role === 'ADMIN') {
        redirect('/admin');
    } else if (user.role === 'TEACHER') {
        redirect('/teacher');
    } else {
        redirect('/');
    }
}


