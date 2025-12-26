'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
    const [state, action, pending] = useActionState(loginAction, undefined);

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Sullivan Learning</h1>
                    <p className="mt-2 text-sm text-muted-foreground">アカウントにログインしてください</p>
                </div>
                <div className="rounded-xl bg-card p-8 shadow-lg border border-border">
                    <form action={action} className="space-y-6" autoComplete="off">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">ログインID</label>
                            <input
                                name="loginId"
                                type="text"
                                required
                                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="例: S0001"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">パスワード</label>
                            <input
                                name="password"
                                type="password"
                                required
                                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        {state?.error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
                                {state.error}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={pending}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 w-full shadow-sm"
                        >
                            {pending ? 'ログイン中...' : 'ログイン'}
                        </button>
                    </form>
                </div>
                <div className="text-center text-sm">
                </div>
            </div>
        </div>
    );
}
