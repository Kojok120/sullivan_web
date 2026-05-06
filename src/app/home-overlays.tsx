'use client';

import dynamic from 'next/dynamic';
import { type Achievement, type UserAchievement } from '@prisma/client';

// StampOverlay / AchievementOverlay は framer-motion を pull-in する。
// 表示頻度は採点直後・実績解除直後だけのため、初期バンドルから外して
// クライアント側で必要時だけロードする。
const StampOverlay = dynamic(
    () => import('@/components/grading/stamp-overlay').then((mod) => mod.StampOverlay),
    { ssr: false },
);

const AchievementOverlay = dynamic(
    () => import('@/components/gamification/achievement-overlay').then((mod) => mod.AchievementOverlay),
    { ssr: false },
);

type ExtendedUserAchievement = UserAchievement & {
    achievement: Achievement;
};

type HomeOverlaysProps = {
    initialStampOverlayData: { total: number; newCount: number } | null;
    initialAchievementQueue: ExtendedUserAchievement[];
};

export function HomeOverlays({ initialStampOverlayData, initialAchievementQueue }: HomeOverlaysProps) {
    return (
        <>
            <StampOverlay initialData={initialStampOverlayData} />
            <AchievementOverlay initialQueue={initialAchievementQueue} />
        </>
    );
}
