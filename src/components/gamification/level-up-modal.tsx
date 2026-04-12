'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Sparkles } from 'lucide-react';

type LevelUpModalProps = {
    open: boolean;
    data: { newLevel: number; xpGained: number } | null;
    onOpenChange: (open: boolean) => void;
};

export function LevelUpModal({ open, data, onOpenChange }: LevelUpModalProps) {

    if (!data) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md text-center border-primary/30">
                <DialogHeader>
                    <div className="mx-auto bg-primary/10 p-4 rounded-full mb-4">
                        <Trophy className="h-12 w-12 text-primary" />
                    </div>
                    <DialogTitle className="text-2xl font-bold text-foreground">Level Up!</DialogTitle>
                    <DialogDescription className="text-lg font-medium text-muted-foreground">
                        おめでとうございます！<br />
                        レベル {data.newLevel} になりました！
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-muted-foreground flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        今回の獲得XP: <span className="font-bold text-foreground">+{data.xpGained} XP</span>
                    </p>
                </div>
                <div className="flex justify-center">
                    <Button onClick={() => onOpenChange(false)} className="font-bold px-8">
                        おめでとう！
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
