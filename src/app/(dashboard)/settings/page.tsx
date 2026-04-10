'use client';

import { useActionState } from 'react';
import { updatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInputField } from '@/components/auth/password-input-field';

export default function SettingsPage() {
    const [state, action, pending] = useActionState(updatePassword, undefined);

    return (
        <div className="container mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-8 text-foreground">アカウント設定</h1>

            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle>パスワード変更</CardTitle>
                    <CardDescription>
                        新しいパスワードを設定します。8文字以上で入力してください。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={action} className="space-y-4">
                        <PasswordInputField id="currentPassword" name="currentPassword" label="現在のパスワード" />
                        <PasswordInputField id="newPassword" name="newPassword" label="新しいパスワード" minLength={8} />
                        <PasswordInputField id="confirmPassword" name="confirmPassword" label="新しいパスワード（確認）" minLength={8} />

                        {state?.error && (
                            <p className="text-sm text-red-500 font-medium">{state.error}</p>
                        )}

                        {state?.success && (
                            <div className="rounded-md bg-green-50 p-4 text-green-700 text-sm font-medium">
                                パスワードを変更しました。次回ログイン時から新しいパスワードを使用してください。
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={pending}>
                            {pending ? '変更中...' : 'パスワードを変更する'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
