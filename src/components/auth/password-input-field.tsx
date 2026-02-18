'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PasswordInputFieldProps {
    id: string;
    name: string;
    label: string;
    required?: boolean;
    minLength?: number;
    autoComplete?: string;
    inputClassName?: string;
    toggleClassName?: string;
}

export function PasswordInputField({
    id,
    name,
    label,
    required = true,
    minLength,
    autoComplete,
    inputClassName,
    toggleClassName,
}: PasswordInputFieldProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                <Input
                    id={id}
                    name={name}
                    type={visible ? 'text' : 'password'}
                    required={required}
                    minLength={minLength}
                    autoComplete={autoComplete}
                    className={cn('pr-10', inputClassName)}
                />
                <button
                    type="button"
                    onClick={() => setVisible((prev) => !prev)}
                    aria-label={visible ? 'パスワードを非表示' : 'パスワードを表示'}
                    aria-pressed={visible}
                    className={cn(
                        'absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        toggleClassName
                    )}
                >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}
