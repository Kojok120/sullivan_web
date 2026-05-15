"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { markLevelAsSeen } from '@/app/actions/level';
import { LevelUpModal } from '@/components/gamification/level-up-modal';
import {
    type RealtimeEventRecord,
    subscribeToUserRealtimeEvents,
} from '@/lib/realtime-events-client';

type LevelUpState = {
    newLevel: number;
    xpGained: number;
} | null;

type StudentRealtimeEventRecord =
    | RealtimeEventRecord<'grading_completed', { groupId?: string } | null>
    | RealtimeEventRecord<'grading_failed', null>
    | RealtimeEventRecord<'gamification_update', {
        levelUp?: { newLevel?: number };
        xpGained?: number;
    } | null>;

export function StudentRealtimeEvents() {
    const router = useRouter();
    const t = useTranslations('Realtime');
    const [levelUpData, setLevelUpData] = useState<LevelUpState>(null);
    const [isLevelUpOpen, setIsLevelUpOpen] = useState(false);

    useEffect(() => {
        let unsubscribe = () => { };

        void (async () => {
            unsubscribe = await subscribeToUserRealtimeEvents<StudentRealtimeEventRecord>({
                channelName: 'realtime-events:student',
                onInsert: async (record) => {
                    if (record.type === 'grading_completed') {
                        const groupId = record.payload?.groupId;

                        toast.success(t('gradingCompleted'), {
                            description: t('gradingCompletedDescription'),
                            action: {
                                label: t('view'),
                                onClick: () => {
                                    router.push(groupId ? `/dashboard/history/${groupId}` : '/dashboard/history');
                                },
                            },
                            duration: 5000,
                        });
                        return;
                    }

                    if (record.type === 'grading_failed') {
                        toast.error(t('gradingFailed'), {
                            description: t('gradingFailedDescription'),
                            duration: 6000,
                            dismissible: true,
                        });
                        return;
                    }

                    if (record.type !== 'gamification_update') {
                        return;
                    }

                    const newLevel = record.payload?.levelUp?.newLevel;
                    if (!newLevel) {
                        return;
                    }

                    setLevelUpData({
                        newLevel,
                        xpGained: record.payload?.xpGained ?? 0,
                    });
                    setIsLevelUpOpen(true);

                    try {
                        await markLevelAsSeen(newLevel);
                    } catch (error) {
                        console.error('[StudentRealtimeEvents] Failed to mark level as seen:', error);
                    }
                },
            });
        })();

        return () => {
            unsubscribe();
        };
    }, [router, t]);

    return (
        <LevelUpModal
            open={isLevelUpOpen}
            data={levelUpData}
            onOpenChange={setIsLevelUpOpen}
        />
    );
}
