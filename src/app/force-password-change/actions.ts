'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { passwordUpdateSchema, updateUserPassword } from '@/lib/password-service';

export async function forceUpdatePassword(_prevState: unknown, formData: FormData) {
    const rawData = {
        newPassword: formData.get('newPassword') as string,
        confirmPassword: formData.get('confirmPassword') as string,
    };

    const result = passwordUpdateSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { newPassword } = result.data;

    const updateResult = await updateUserPassword(newPassword);

    if (!updateResult.success) {
        return { error: updateResult.error };
    }

    const session = await getSession();

    if (session?.role === 'ADMIN') {
        redirect('/admin');
    }

    if (session?.role === 'MATERIAL_AUTHOR') {
        redirect('/materials/problems');
    }

    if (session?.role === 'TEACHER' || session?.role === 'HEAD_TEACHER') {
        redirect('/teacher');
    }

    redirect('/');
}
