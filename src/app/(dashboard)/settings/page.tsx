'use client';

import { useActionState } from 'react';
import { updatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
    const [state, action, pending] = useActionState(updatePassword, undefined);

    return (
        <div className="container mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-8 text-gray-800">アカウント設定</h1>

            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle>パスワード変更</CardTitle>
                    <CardDescription>
                        新しいパスワードを設定します。8文字以上で入力してください。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={action} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">現在のパスワード</Label>
                            <Input
                                id="currentPassword"
                                name="currentPassword"
                                type="password"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">新しいパスワード</Label>
                            <Input
                                id="newPassword"
                                name="newPassword"
                                type="password"
                                required
                                minLength={8}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                required
                                minLength={8}
                            />
                        </div>

                        {state?.error && (
                            <p className="text-sm text-red-500 font-medium">{state.error}</p>
                        )}

                        {state?.success && (
                            <div className="rounded-md bg-green-50 p-4 text-green-700 text-sm font-medium">
                                パスワードを変更しました。次回ログイン時から新しいパスワードを使用してください。
                            </div>
                        )}

                        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={pending}>
                            {pending ? '変更中...' : 'パスワードを変更する'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
