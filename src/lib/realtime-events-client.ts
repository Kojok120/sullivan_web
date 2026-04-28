import type { RealtimeEventType } from '@/lib/realtime-events';
import { createClient } from '@/lib/supabase/client';

export type RealtimeEventRecord<
    TType extends RealtimeEventType = RealtimeEventType,
    TPayload = unknown,
> = {
    type?: TType;
    payload?: TPayload;
};

type SubscribeParams<TRecord extends RealtimeEventRecord = RealtimeEventRecord> = {
    channelName: string;
    onInsert: (record: TRecord) => void | Promise<void>;
};

export async function subscribeToUserRealtimeEvents<TRecord extends RealtimeEventRecord = RealtimeEventRecord>({
    channelName,
    onInsert,
}: SubscribeParams<TRecord>): Promise<() => void> {
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
            (payload: { new: TRecord | null }) => {
                const record = payload.new;
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
