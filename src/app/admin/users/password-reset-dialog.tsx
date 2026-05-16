'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '../actions';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface PasswordResetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    userName: string;
    loginId: string;
}

export function PasswordResetDialog({
    open,
    onOpenChange,
    userId,
    userName,
    loginId,
}: PasswordResetDialogProps) {
    const t = useTranslations('AdminPasswordResetDialog');
    const [password, setPassword] = useState('');
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        if (password.length < 8) {
            setError(t('passwordTooShort'));
            return;
        }

        startTransition(async () => {
            const result = await resetPassword(userId, password);
            if (result.success) {
                setSuccess(true);
                setPassword('');
                setTimeout(() => {
                    onOpenChange(false);
                    setSuccess(false);
                }, 2000);
            } else {
                setError(result.error || t('resetFailed'));
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>
                        {t('description', { userName, loginId })}
                        <br />
                        <span className="text-red-500 text-xs">{t('immediateNotice')}</span>
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="new-password">{t('newPasswordLabel')}</Label>
                            <div className="relative">
                                <Input
                                    id="new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('passwordPlaceholder')}
                                    disabled={isPending || success}
                                    required
                                    minLength={8}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                    aria-pressed={showPassword}
                                    disabled={isPending || success}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                    {success && <p className="text-sm text-green-600 mb-4 font-bold">{t('success')}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="min-h-11 sm:min-h-10">
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isPending || success} className="min-h-11 sm:min-h-10">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
