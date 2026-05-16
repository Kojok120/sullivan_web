'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { createPasswordUpdateSchema, type PasswordServiceMessages, updateUserPassword } from '@/lib/password-service';

export async function forceUpdatePassword(_prevState: unknown, formData: FormData) {
    const t = await getTranslations('PasswordErrors');
    const passwordMessages: PasswordServiceMessages = {
        currentPasswordRequired: t('currentPasswordRequired'),
        newPasswordTooShort: t('newPasswordTooShort'),
        confirmPasswordRequired: t('confirmPasswordRequired'),
        passwordsMismatch: t('passwordsMismatch'),
        updateFailed: t('passwordUpdateFailed'),
        userLoadFailed: t('userLoadFailed'),
        currentPasswordIncorrect: t('currentPasswordIncorrect'),
    };

    const rawData = {
        newPassword: formData.get('newPassword') as string,
        confirmPassword: formData.get('confirmPassword') as string,
    };

    const result = createPasswordUpdateSchema(passwordMessages).safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { newPassword } = result.data;

    const updateResult = await updateUserPassword(newPassword, passwordMessages);

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
