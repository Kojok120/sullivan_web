'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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

const sendBackFormSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(1, '差し戻し理由を入力してください')
        .max(SENT_BACK_REASON_MAX, `差し戻し理由は${SENT_BACK_REASON_MAX}文字以内で入力してください`),
});

type SendBackFormValues = z.infer<typeof sendBackFormSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
    pending?: boolean;
    initialReason?: string;
}

export function SendBackDialog({ open, onOpenChange, onConfirm, pending = false, initialReason = '' }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>差し戻し理由</DialogTitle>
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
    const form = useForm<SendBackFormValues>({
        resolver: zodResolver(sendBackFormSchema),
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
                placeholder="どこを直してほしいかを書いてください"
                disabled={pending}
                {...form.register('reason')}
            />
            <p className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>残り {remaining} 文字</p>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                    キャンセル
                </Button>
                <Button type="submit" variant="destructive" disabled={!canSubmit}>
                    差し戻す
                </Button>
            </DialogFooter>
        </form>
    );
}
