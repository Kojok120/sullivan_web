'use client';

import { useActionState, useState } from 'react';
import { forceUpdatePassword } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logoutAction } from '@/app/actions';
import { Eye, EyeOff, LogOut } from 'lucide-react';

export default function ForcePasswordChangePage() {
    const [state, action, pending] = useActionState(forceUpdatePassword, undefined);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                        パスワードの変更が必要です
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
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
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">新しいパスワード</Label>
                                <div className="relative">
                                    <Input
                                        id="newPassword"
                                        name="newPassword"
                                        type={showNewPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword((prev) => !prev)}
                                        aria-label={showNewPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                                        aria-pressed={showNewPassword}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                                        autoComplete="new-password"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                        aria-label={showConfirmPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                                        aria-pressed={showConfirmPassword}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {state?.error && (
                                <p className="text-sm text-red-500 font-medium">{state.error}</p>
                            )}

                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={pending}>
                                {pending ? '変更中...' : 'パスワードを変更して利用開始'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="text-center">
                    <form action={logoutAction}>
                        <Button variant="ghost" className="text-sm text-gray-500 hover:text-gray-700">
                            <LogOut className="mr-2 h-4 w-4" />
                            今はログアウトする
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
