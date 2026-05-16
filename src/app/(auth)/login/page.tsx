'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loginAction } from './actions';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const t = useTranslations('Login');
    const [state, action, pending] = useActionState(loginAction, undefined);
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Sullivan</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="rounded-lg bg-card p-8 border border-border">
                    <form action={action} className="space-y-6" autoComplete="off">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t('loginIdLabel')}</label>
                            <input
                                name="loginId"
                                type="text"
                                required
                                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder={t('loginIdPlaceholder')}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t('passwordLabel')}</label>
                            <div className="relative">
                                <input
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                    aria-pressed={showPassword}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        {state?.error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
                                {state.error}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={pending}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 w-full"
                        >
                            {pending ? t('submitting') : t('submit')}
                        </button>
                    </form>
                </div>
                <div className="text-center text-sm">
                </div>
            </div>
        </div>
    );
}
