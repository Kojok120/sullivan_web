'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getLevelData, markLevelAsSeen, type LevelData } from '@/app/actions/level';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles } from 'lucide-react';

export function LevelUpOverlay() {
    const [data, setData] = useState<LevelData | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkLevel = async () => {
            try {
                const levelData = await getLevelData();
                if (levelData && levelData.currentLevel > levelData.lastSeenLevel) {
                    setData(levelData);
                    setIsVisible(true);
                    triggerConfetti();
                }
            } catch (error) {
                console.error("Failed to check level:", error);
            }
        };

        checkLevel();
    }, []);

    const handleClose = async () => {
        if (!data) return;

        setIsVisible(false);
        // Mark as seen in background
        await markLevelAsSeen(data.currentLevel);
    };

    const triggerConfetti = () => {
        const duration = 4000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 40, spread: 360, ticks: 100, zIndex: 9999 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 70 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.4), y: Math.random() - 0.2 }, colors: ['#FFD700', '#FFA500', '#FFFFFF'] });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.6, 0.9), y: Math.random() - 0.2 }, colors: ['#FFD700', '#FFA500', '#FFFFFF'] });
        }, 250);
    };

    return (
        <AnimatePresence>
            {isVisible && data && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                >
                    <motion.div
                        initial={{ scale: 0.3, y: 100 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="w-full max-w-sm relative"
                    >
                        {/* Radiant background */}
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-300 rounded-full blur-[60px] opacity-40 animate-pulse"></div>

                        <div className="bg-white/10 backdrop-blur-lg border border-white/20 text-center p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                            {/* Decorative elements */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute -top-20 -right-20 w-40 h-40 border-4 border-yellow-200/20 rounded-full border-dashed"
                            />

                            <motion.div
                                initial={{ y: -50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="inline-block relative">
                                    <Crown className="h-24 w-24 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]" fill="currentColor" />
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: [1, 1.4, 1] }}
                                        transition={{ delay: 0.5, duration: 0.5 }}
                                        className="absolute -top-2 -right-2"
                                    >
                                        <Sparkles className="h-8 w-8 text-white" />
                                    </motion.div>
                                </div>
                            </motion.div>

                            <motion.h2
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.4, type: "spring" }}
                                className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-400 mt-4 mb-2 drop-shadow-sm"
                            >
                                LEVEL UP!
                            </motion.h2>

                            <div className="flex items-center justify-center gap-4 my-8">
                                <motion.div
                                    className="text-gray-400 text-2xl font-bold"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 0.6 }}
                                >
                                    Lv. {data.lastSeenLevel}
                                </motion.div>
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1, rotate: [0, 180, 360] }}
                                    transition={{ delay: 0.8, duration: 0.5 }}
                                >
                                    <div className="text-yellow-400 text-2xl">➔</div>
                                </motion.div>
                                <motion.div
                                    className="text-white text-5xl font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 1.0, type: "spring", stiffness: 300 }}
                                >
                                    Lv. {data.currentLevel}
                                </motion.div>
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1.5 }}
                            >
                                <Button
                                    size="lg"
                                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold text-xl py-6 rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95 border-t border-white/20"
                                    onClick={handleClose}
                                >
                                    すごーい！！
                                </Button>
                            </motion.div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
