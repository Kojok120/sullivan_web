
import { getLearningSessions } from '@/lib/analytics';
import { SessionListClient } from './session-list-client';

export async function SessionList({ userId }: { userId: string }) {
    const sessions = await getLearningSessions(userId, 5); // Latest 5

    return <SessionListClient initialSessions={sessions} />;
}
