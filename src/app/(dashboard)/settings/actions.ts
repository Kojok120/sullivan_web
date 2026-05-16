'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
    createPasswordFieldsSchema,
    type PasswordServiceMessages,
    updateUserPassword,
    verifyCurrentPassword
} from '@/lib/password-service';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

function createSettingsPasswordSchema(messages: PasswordServiceMessages) {
    return z.object({
        currentPassword: z.string().min(1, messages.currentPasswordRequired),
    }).merge(createPasswordFieldsSchema(messages)).refine((data) => data.newPassword === data.confirmPassword, {
        message: messages.passwordsMismatch,
        path: ['confirmPassword'],
    });
}

export async function updatePassword(_prevState: unknown, formData: FormData) {
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

    try {
        const session = await getSession();
        if (!session) {
            return { error: t('loginRequired') };
        }

        const allowedRoles = new Set(['STUDENT', 'TEACHER', 'HEAD_TEACHER', 'PARENT', 'ADMIN']);
        if (!allowedRoles.has(session.role)) {
            return { error: t('permissionDenied') };
        }

        const rawData = {
            currentPassword: formData.get('currentPassword') as string,
            newPassword: formData.get('newPassword') as string,
            confirmPassword: formData.get('confirmPassword') as string,
        };

        const result = createSettingsPasswordSchema(passwordMessages).safeParse(rawData);

        if (!result.success) {
            return { error: result.error.errors[0].message };
        }

        const { currentPassword, newPassword } = result.data;

        // 現在のパスワードを検証
        const verifyResult = await verifyCurrentPassword(currentPassword, passwordMessages);
        if (!verifyResult.success) {
            return { error: verifyResult.error };
        }

        // 新しいパスワードで更新
        const updateResult = await updateUserPassword(newPassword, passwordMessages);
        if (!updateResult.success) {
            return { error: updateResult.error };
        }

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to update password in settings action:', error);
        return { error: t('passwordUpdateFailed') };
    }
}
