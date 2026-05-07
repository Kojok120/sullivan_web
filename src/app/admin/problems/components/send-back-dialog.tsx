'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const REASON_MAX = 500;

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
    const [reason, setReason] = useState(initialReason);
    const trimmed = reason.trim();
    const remaining = REASON_MAX - reason.length;
    const canSubmit = !pending && trimmed.length > 0 && reason.length <= REASON_MAX;

    return (
        <>
            <Textarea
                autoFocus
                rows={6}
                maxLength={REASON_MAX}
                placeholder="どこを直してほしいかを書いてください"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={pending}
            />
            <p className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>残り {remaining} 文字</p>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} disabled={pending}>
                    キャンセル
                </Button>
                <Button variant="destructive" onClick={() => onConfirm(trimmed)} disabled={!canSubmit}>
                    差し戻す
                </Button>
            </DialogFooter>
        </>
    );
}
