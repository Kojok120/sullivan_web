import { createClient } from '@/lib/supabase/client';

export type RealtimeEventRecord = {
    type?: string;
    payload?: unknown;
};

type SubscribeParams = {
    channelName: string;
    onInsert: (record: RealtimeEventRecord) => void | Promise<void>;
};

export async function subscribeToUserRealtimeEvents({
    channelName,
    onInsert,
}: SubscribeParams): Promise<() => void> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return () => { };
    }

    const prismaUserId = (user.app_metadata as { prismaUserId?: string } | null)?.prismaUserId || user.id;
    const channel = supabase
        .channel(`${channelName}:${prismaUserId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'realtime_events',
                filter: `user_id=eq.${prismaUserId}`,
            },
            (payload) => {
                const record = payload.new as RealtimeEventRecord | null;
                if (!record) return;
                void Promise.resolve(onInsert(record)).catch((error) => {
                    console.error('[Realtime] onInsert handler failed:', error);
                });
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
