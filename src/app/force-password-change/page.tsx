'use client';

import { useActionState } from 'react';
import { forceUpdatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logoutAction } from '@/app/actions';
import { LogOut } from 'lucide-react';
import { PasswordInputField } from '@/components/auth/password-input-field';

export default function ForcePasswordChangePage() {
    const [state, action, pending] = useActionState(forceUpdatePassword, undefined);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-foreground">
                        パスワードの変更が必要です
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        セキュリティのため、初期パスワードを変更してください。<br />
                        変更するまで他の機能は利用できません。
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>新しいパスワード設定</CardTitle>
                        <CardDescription>
                            8文字以上で、推測されにくいパスワードを設定してください。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form action={action} className="space-y-6">
                            <PasswordInputField
                                id="newPassword"
                                name="newPassword"
                                label="新しいパスワード"
                                minLength={8}
                                autoComplete="new-password"
                                toggleClassName="text-muted-foreground hover:text-foreground focus-visible:ring-ring"
                            />
                            <PasswordInputField
                                id="confirmPassword"
                                name="confirmPassword"
                                label="新しいパスワード（確認）"
                                minLength={8}
                                autoComplete="new-password"
                                toggleClassName="text-muted-foreground hover:text-foreground focus-visible:ring-ring"
                            />

                            {state?.error && (
                                <p className="text-sm text-red-500 font-medium">{state.error}</p>
                            )}

                            <Button type="submit" className="w-full" disabled={pending}>
                                {pending ? '変更中...' : 'パスワードを変更して利用開始'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="text-center">
                    <form action={logoutAction}>
                        <Button variant="ghost" className="text-sm text-muted-foreground hover:text-foreground">
                            <LogOut className="mr-2 h-4 w-4" />
                            今はログアウトする
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
