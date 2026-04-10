'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Sparkles } from 'lucide-react';
import { markLevelAsSeen } from '@/app/actions/level';
import { subscribeToUserRealtimeEvents } from '@/lib/realtime-events-client';

export function LevelUpModal() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<{ newLevel: number; xpGained: number } | null>(null);

    useEffect(() => {
        let unsubscribe = () => { };

        void (async () => {
            unsubscribe = await subscribeToUserRealtimeEvents({
                channelName: 'realtime-events:gamification',
                onInsert: async (record) => {
                    if (record.type !== 'gamification_update') return;

                    const update = record.payload as {
                        levelUp?: { newLevel?: number };
                        xpGained?: number;
                    } | undefined;

                    if (update?.levelUp?.newLevel) {
                        setData({
                            newLevel: update.levelUp.newLevel,
                            xpGained: update.xpGained ?? 0,
                        });
                        setOpen(true);
                        await markLevelAsSeen(update.levelUp.newLevel);
                    }
                },
            });
        })();

        return () => {
            unsubscribe();
        };
    }, []);

    if (!data) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
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
                    <Button onClick={() => setOpen(false)} className="font-bold px-8">
                        おめでとう！
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
