'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnseenAchievements, markAchievementsAsSeen } from '@/app/actions/achievement';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { type Achievement, type UserAchievement } from '@prisma/client';
import { CelebrationOverlayShell } from '@/components/gamification/celebration-overlay-shell';
import { CelebrationIntro } from '@/components/gamification/celebration-intro';
import { useTranslations } from 'next-intl';

type ExtendedUserAchievement = UserAchievement & {
    achievement: Achievement;
};

type AchievementOverlayProps = {
    initialQueue?: ExtendedUserAchievement[];
};

export function AchievementOverlay({ initialQueue }: AchievementOverlayProps) {
    const t = useTranslations('AchievementOverlay');
    const [queue, setQueue] = useState<ExtendedUserAchievement[]>(() => initialQueue ?? []);
    const current = queue[0] || null;

    useEffect(() => {
        if (initialQueue !== undefined) {
            return;
        }

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
    }, [initialQueue]);

    const handleClose = async () => {
        if (!current) return;

        await markAchievementsAsSeen([current.id]);

        setQueue((prev) => prev.slice(1));
    };

    return (
        <AnimatePresence>
            {current && (
                <CelebrationOverlayShell maxWidthClassName="max-w-md">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-muted-foreground hover:bg-muted rounded-full"
                        onClick={handleClose}
                        aria-label={t('close')}
                        title={t('close')}
                    >
                        <X className="h-6 w-6" />
                    </Button>

                    <CelebrationIntro
                        title={t('title')}
                        description={(
                            <>
                                <h3 className="text-2xl font-bold text-foreground">
                                    {current.achievement.name}
                                </h3>
                                <p className="text-muted-foreground font-medium">
                                    {current.achievement.description}
                                </p>
                            </>
                        )}
                        badgeText={`+${current.achievement.xpReward} XP`}
                    />

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.2 }}
                        className="mt-8"
                    >
                        <Button
                            size="lg"
                            className="w-full font-bold text-lg"
                            onClick={handleClose}
                        >
                            {t('confirm')}
                        </Button>
                    </motion.div>
                </CelebrationOverlayShell>
            )}
        </AnimatePresence>
    );
}
