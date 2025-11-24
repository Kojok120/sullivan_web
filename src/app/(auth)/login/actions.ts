'use server';

import { prisma } from '@/lib/prisma';
import { login, verifyPassword } from '@/lib/auth';
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';

export async function loginAction(prevState: any, formData: FormData) {
    const loginId = formData.get('loginId') as string;
    const password = formData.get('password') as string;

    if (!loginId || !password) {
        return { error: 'IDとパスワードを入力してください' };
    }

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


