"use client";

import { useEffect } from 'react';
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function GradingNotifier() {
    const router = useRouter();

    useEffect(() => {
        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const setup = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const prismaUserId = (user.app_metadata as { prismaUserId?: string } | null)?.prismaUserId || user.id;

            channel = supabase
                .channel(`realtime-events:grading:${prismaUserId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'realtime_events',
                        filter: `user_id=eq.${prismaUserId}`,
                    },
                    (payload) => {
                        const record = payload.new as { type?: string; payload?: any } | null;
                        if (!record) return;

                        if (record.type === 'grading_completed') {
                            const groupId = record.payload?.groupId as string | undefined;

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
                    }
                )
                .subscribe();
        };

        setup();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [router]);

    return null; // This component handles side-effects only (notifications)
}
