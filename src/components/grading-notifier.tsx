"use client";

import { useEffect } from 'react';
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { subscribeToUserRealtimeEvents } from '@/lib/realtime-events-client';

export function GradingNotifier() {
    const router = useRouter();

    useEffect(() => {
        let unsubscribe = () => { };

        void (async () => {
            unsubscribe = await subscribeToUserRealtimeEvents({
                channelName: 'realtime-events:grading',
                onInsert: (record) => {
                    if (record.type === 'grading_completed') {
                        const eventPayload = record.payload as { groupId?: string } | undefined;
                        const groupId = eventPayload?.groupId;

                        toast.success("採点が完了しました！", {
                            description: "クリックして結果を確認する",
                            action: {
                                label: "見る",
                                onClick: () => {
                                    if (groupId) {
                                        router.push(`/dashboard/history/${groupId}`);
                                    } else {
                                        router.push(`/dashboard/history`);
                                    }
                                }
                            },
                            duration: 5000,
                        });
                    } else if (record.type === 'grading_failed') {
                        toast.error("採点中にエラーが発生しました", {
                            description: "お手数ですが、講師に相談してください。",
                            duration: 6000,
                            dismissible: true
                        });
                    }
                },
            });
        })();

        return () => {
            unsubscribe();
        };
    }, [router]);

    return null; // This component handles side-effects only (notifications)
}
