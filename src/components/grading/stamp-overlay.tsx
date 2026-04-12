'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StampCard } from './stamp-card';
import { getStampData, markStampsAsSeen } from '@/app/actions/stamp';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { triggerCelebrationConfetti } from '@/lib/confetti';

type StampOverlayProps = {
    initialData?: { total: number; newCount: number } | null;
};

export function StampOverlay({ initialData }: StampOverlayProps) {
    const [isOpen, setIsOpen] = useState(() => Boolean(initialData));
    const [data, setData] = useState<{ total: number, newCount: number } | null>(() => initialData ?? null);

    useEffect(() => {
        if (initialData) {
            triggerCelebrationConfetti();
        }
    }, [initialData]);

    useEffect(() => {
        if (initialData !== undefined) {
            return;
        }

        const checkStamps = async () => {
            try {
                const stampData = await getStampData();
                if (stampData && stampData.newStamps > 0) {
                    setData({ total: stampData.totalStamps, newCount: stampData.newStamps });
                    setIsOpen(true);
                    triggerCelebrationConfetti();
                }
            } catch (error) {
                console.error("Failed to check stamps:", error);
            }
        };

        // Check immediately on mount
        checkStamps();

        // Optional: Poll every 30 seconds for external updates (e.g. if grading finished in bg)
        // const interval = setInterval(checkStamps, 30000);
        // return () => clearInterval(interval);
    }, [initialData]);

    const handleClose = async () => {
        setIsOpen(false);
        if (data) {
            await markStampsAsSeen(data.total);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && data && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ scale: 0.5, y: 50 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.5, y: 50 }}
                        className="w-full max-w-md"
                    >
                        <div className="relative">
                            {/* Close button just in case */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -top-12 right-0 text-white hover:bg-white/20"
                                onClick={handleClose}
                            >
                                <X className="h-6 w-6" />
                            </Button>

                            <div className="text-center mb-8">
                                <motion.h2
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1.2 }}
                                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                                    className="text-4xl font-extrabold text-white drop-shadow-md"
                                >
                                    提出えらい！
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-xl text-yellow-300 mt-2 font-bold"
                                >
                                    スタンプ {data.newCount}個 GET!!
                                </motion.p>
                            </div>

                            <StampCard totalStamps={data.total} newStamps={data.newCount} />

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 2 }} // Wait 2 seconds before showing close button to ensure they see it
                                className="mt-8 flex justify-center"
                            >
                                <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 transform transition active:scale-95" onClick={handleClose}>
                                    あつめる！
                                </Button>
                            </motion.div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
