'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInputField } from '@/components/auth/password-input-field';

export default function SettingsPage() {
    const t = useTranslations('Settings');
    const [state, action, pending] = useActionState(updatePassword, undefined);

    return (
        <div className="container mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-8 text-foreground">{t('title')}</h1>

            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle>{t('passwordCardTitle')}</CardTitle>
                    <CardDescription>
                        {t('passwordCardDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={action} className="space-y-4">
                        <PasswordInputField id="currentPassword" name="currentPassword" label={t('currentPasswordLabel')} />
                        <PasswordInputField id="newPassword" name="newPassword" label={t('newPasswordLabel')} minLength={8} />
                        <PasswordInputField id="confirmPassword" name="confirmPassword" label={t('confirmPasswordLabel')} minLength={8} />

                        {state?.error && (
                            <p className="text-sm text-red-500 font-medium">{state.error}</p>
                        )}

                        {state?.success && (
                            <div className="rounded-md bg-green-50 p-4 text-green-700 text-sm font-medium">
                                {t('success')}
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={pending}>
                            {pending ? t('submitting') : t('submit')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
