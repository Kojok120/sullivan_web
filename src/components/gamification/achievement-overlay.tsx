'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnseenAchievements, markAchievementsAsSeen } from '@/app/actions/achievement';
import { Button } from '@/components/ui/button';
import { Trophy, X, Star } from 'lucide-react';
import { type Achievement, type UserAchievement } from '@prisma/client';
import { triggerCelebrationConfetti } from '@/lib/confetti';

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
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ scale: 0.5, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0.5, rotate: 10, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className="w-full max-w-md relative"
                    >
                        {/* Shining background effect */}
                        <div className="absolute inset-0 bg-yellow-400 rounded-full blur-3xl opacity-20 animate-pulse"></div>

                        <div className="bg-gradient-to-br from-yellow-100 to-white text-center p-8 rounded-3xl shadow-2xl relative border-4 border-yellow-400">
                            {/* Close button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 text-yellow-600 hover:bg-yellow-200 rounded-full"
                                onClick={handleClose}
                            >
                                <X className="h-6 w-6" />
                            </Button>

                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="inline-block p-6 rounded-full bg-yellow-400 shadow-inner mb-6"
                            >
                                <Trophy className="h-16 w-16 text-white" />
                            </motion.div>

                            <motion.h2
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="text-3xl font-black text-yellow-600 mb-2"
                            >
                                実績解除！
                            </motion.h2>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="mb-6 space-y-2"
                            >
                                <h3 className="text-2xl font-bold text-gray-800">
                                    {current.achievement.name}
                                </h3>
                                <p className="text-gray-600 font-medium">
                                    {current.achievement.description}
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.6, type: "spring" }}
                                className="inline-flex items-center gap-2 bg-yellow-500 text-white px-6 py-2 rounded-full font-bold text-lg shadow-lg"
                            >
                                <Star className="h-5 w-5 fill-current" />
                                +{current.achievement.xpReward} XP
                            </motion.div>

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
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
