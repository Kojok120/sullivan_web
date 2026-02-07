'use server';

import { redirect } from 'next/navigation';
import { passwordUpdateSchema, updateUserPassword } from '@/lib/password-service';

export async function forceUpdatePassword(prevState: any, formData: FormData) {
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

    redirect('/');
}

