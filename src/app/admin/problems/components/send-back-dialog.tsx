'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { SENT_BACK_REASON_MAX } from '../constants';

type SendBackFormValues = {
    reason: string;
};

function buildSendBackFormSchema(t: ReturnType<typeof useTranslations>) {
    return z.object({
        reason: z
            .string()
            .trim()
            .min(1, t('reasonRequired'))
            .max(SENT_BACK_REASON_MAX, t('reasonTooLong', { max: SENT_BACK_REASON_MAX })),
    });
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
    pending?: boolean;
    initialReason?: string;
}

export function SendBackDialog({ open, onOpenChange, onConfirm, pending = false, initialReason = '' }: Props) {
    const t = useTranslations('SendBackDialog');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                </DialogHeader>
                {open && (
                    <SendBackDialogBody
                        key={initialReason}
                        initialReason={initialReason}
                        pending={pending}
                        onCancel={() => onOpenChange(false)}
                        onConfirm={onConfirm}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

interface BodyProps {
    initialReason: string;
    pending: boolean;
    onCancel: () => void;
    onConfirm: (reason: string) => void;
}

function SendBackDialogBody({ initialReason, pending, onCancel, onConfirm }: BodyProps) {
    const t = useTranslations('SendBackDialog');
    const form = useForm<SendBackFormValues>({
        resolver: zodResolver(buildSendBackFormSchema(t)),
        defaultValues: { reason: initialReason },
        mode: 'onChange',
    });

    const reasonValue = useWatch({ control: form.control, name: 'reason' }) ?? '';
    const remaining = SENT_BACK_REASON_MAX - reasonValue.length;
    const canSubmit = !pending && reasonValue.trim().length > 0 && reasonValue.length <= SENT_BACK_REASON_MAX;

    const submit = form.handleSubmit((values) => {
        onConfirm(values.reason.trim());
    });

    return (
        <form onSubmit={submit}>
            <Textarea
                autoFocus
                rows={6}
                maxLength={SENT_BACK_REASON_MAX}
                placeholder={t('placeholder')}
                disabled={pending}
                {...form.register('reason')}
            />
            <p className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>{t('remaining', { remaining })}</p>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                    {t('cancel')}
                </Button>
                <Button type="submit" variant="destructive" disabled={!canSubmit}>
                    {t('submit')}
                </Button>
            </DialogFooter>
        </form>
    );
}
