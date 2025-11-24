'use client';

import { useActionState } from 'react';
import { signupAction } from './actions';

export default function SignupPage() {
    const [state, action, pending] = useActionState(signupAction, undefined);

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
                <h1 className="mb-6 text-center text-2xl font-bold">新規登録</h1>

                {state?.success ? (
                    <div className="text-center">
                        <div className="mb-4 rounded-md bg-green-50 p-4 text-green-700">
                            <p className="font-bold">登録が完了しました！</p>
                            <p className="mt-2">あなたのログインID:</p>
                            <p className="text-2xl font-mono font-bold">{state.loginId}</p>
                        </div>
                        <p className="mb-4 text-sm text-gray-600">
                            このIDはログイン時に必要になります。<br />
                            必ず控えておいてください。
                        </p>
                        <a
                            href="/login"
                            className="block w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                        >
                            ログイン画面へ
                        </a>
                    </div>
                ) : (
                    <form action={action} className="space-y-4" autoComplete="off">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">お名前</label>
                            <input
                                name="name"
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">パスワード</label>
                            <input
                                name="password"
                                type="password"
                                required
                                minLength={6}
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">役割</label>
                            <select
                                name="role"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="STUDENT">生徒</option>
                                <option value="TEACHER">講師</option>
                                <option value="PARENT">保護者</option>
                                <option value="ADMIN">管理者</option>
                            </select>
                        </div>
                        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-300"
                        >
                            {pending ? '登録中...' : '登録する'}
                        </button>
                    </form>
                )}

                {!state?.success && (
                    <div className="mt-4 text-center text-sm">
                        <a href="/login" className="text-blue-600 hover:underline">
                            すでにアカウントをお持ちの方はこちら
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
