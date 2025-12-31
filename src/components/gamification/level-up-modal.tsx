'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Star, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

// Simple implementation of SSE listening
export function LevelUpModal() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<{ newLevel: number; xpGained: number } | null>(null);

    useEffect(() => {
        const eventSource = new EventSource('/api/events');

        eventSource.onmessage = (event) => {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'gamification_update') {
                if (parsed.levelUp) {
                    setData({ newLevel: parsed.newLevel, xpGained: parsed.xpGained });
                    setOpen(true);
                    triggerConfetti();
                }
            }
        };

        return () => {
            eventSource.close();
        };
    }, []);

    const triggerConfetti = () => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    if (!data) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md text-center border-yellow-400 bg-gradient-to-b from-yellow-50 to-white">
                <DialogHeader>
                    <div className="mx-auto bg-yellow-100 p-4 rounded-full mb-4 animate-bounce">
                        <Trophy className="h-12 w-12 text-yellow-600" />
                    </div>
                    <DialogTitle className="text-2xl font-bold text-yellow-800">Level Up!</DialogTitle>
                    <DialogDescription className="text-lg font-medium text-yellow-600">
                        おめでとうございます！<br />
                        レベル {data.newLevel} になりました！
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-muted-foreground flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        今回の獲得XP: <span className="font-bold text-foreground">+{data.xpGained} XP</span>
                    </p>
                </div>
                <div className="flex justify-center">
                    <Button onClick={() => setOpen(false)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-8">
                        やったね！
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
