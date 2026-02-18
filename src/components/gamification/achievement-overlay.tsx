'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnseenAchievements, markAchievementsAsSeen } from '@/app/actions/achievement';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { type Achievement, type UserAchievement } from '@prisma/client';
import { triggerCelebrationConfetti } from '@/lib/confetti';
import { CelebrationOverlayShell } from '@/components/gamification/celebration-overlay-shell';
import { CelebrationIntro } from '@/components/gamification/celebration-intro';

type ExtendedUserAchievement = UserAchievement & {
    achievement: Achievement;
};

export function AchievementOverlay() {
    const [queue, setQueue] = useState<ExtendedUserAchievement[]>([]);
    const current = queue[0] || null;
    const currentId = current?.id;

    useEffect(() => {
        const checkAchievements = async () => {
            try {
                const unseen = await getUnseenAchievements();
                if (unseen && unseen.length > 0) {
                    setQueue(unseen);
                }
            } catch (error) {
                console.error("Failed to check achievements:", error);
            }
        };

        checkAchievements();
    }, []);

    useEffect(() => {
        if (currentId) {
            triggerCelebrationConfetti();
            // Play sound effect if desired (optional)
        }
    }, [currentId]);

    const handleClose = async () => {
        if (!current) return;

        // Mark as seen in background
        await markAchievementsAsSeen([current.id]);

        // Remove current from queue
        setQueue((prev) => prev.slice(1));
    };

    return (
        <AnimatePresence>
            {current && (
                <CelebrationOverlayShell accent="yellow" maxWidthClassName="max-w-md">
                    {/* Close button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-yellow-600 hover:bg-yellow-200 rounded-full"
                        onClick={handleClose}
                    >
                        <X className="h-6 w-6" />
                    </Button>

                    <CelebrationIntro
                        accent="yellow"
                        title="実績解除！"
                        description={(
                            <>
                                <h3 className="text-2xl font-bold text-gray-800">
                                    {current.achievement.name}
                                </h3>
                                <p className="text-gray-600 font-medium">
                                    {current.achievement.description}
                                </p>
                            </>
                        )}
                        badgeText={`+${current.achievement.xpReward} XP`}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.5 }}
                        className="mt-8"
                    >
                        <Button
                            size="lg"
                            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95"
                            onClick={handleClose}
                        >
                            やったね！
                        </Button>
                    </motion.div>
                </CelebrationOverlayShell>
            )}
        </AnimatePresence>
    );
}
