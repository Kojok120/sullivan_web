
import { getLearningSessions } from '@/lib/analytics';
import { SessionListClient } from './session-list-client';

type SessionListProps = {
    userId: string;
    basePath?: string; // デフォルト: /dashboard/history
};

export async function SessionList({ userId, basePath = '/dashboard/history' }: SessionListProps) {
    const sessions = await getLearningSessions(userId, 5); // Latest 5

    return <SessionListClient initialSessions={sessions} userId={userId} basePath={basePath} />;
}
