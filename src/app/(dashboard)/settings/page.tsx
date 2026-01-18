'use client';

import { useActionState, useState } from 'react';
import { updatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff } from 'lucide-react';

export default function SettingsPage() {
    const [state, action, pending] = useActionState(updatePassword, undefined);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
                            <div className="relative">
                                <Input
                                    id="currentPassword"
                                    name="currentPassword"
                                    type={showCurrentPassword ? 'text' : 'password'}
                                    required
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                                    aria-label={showCurrentPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                                    aria-pressed={showCurrentPassword}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">新しいパスワード</Label>
                            <div className="relative">
                                <Input
                                    id="newPassword"
                                    name="newPassword"
                                    type={showNewPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword((prev) => !prev)}
                                    aria-label={showNewPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                                    aria-pressed={showNewPassword}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                                    aria-label={showConfirmPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                                    aria-pressed={showConfirmPassword}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
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
