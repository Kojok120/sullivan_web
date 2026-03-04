type MarkLectureAsWatchedParams = {
    coreProblemId: string;
    watchedDurationSeconds?: number;
    videoDurationSeconds?: number;
};

export async function markLectureAsWatched({
    coreProblemId,
    watchedDurationSeconds,
    videoDurationSeconds,
}: MarkLectureAsWatchedParams): Promise<boolean> {
    try {
        const response = await fetch('/api/lecture-watched', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coreProblemId,
                watchedDurationSeconds,
                videoDurationSeconds,
            }),
        });
        if (!response.ok) {
            return false;
        }

        const payload = await response.json().catch(() => null) as { updated?: boolean } | null;
        return payload?.updated === true;
    } catch {
        console.error('Failed to mark lecture as watched');
        return false;
    }
}
