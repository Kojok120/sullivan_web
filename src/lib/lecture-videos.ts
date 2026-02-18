export type LectureVideo = {
    title: string;
    url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeLectureVideos(value: unknown): LectureVideo[] {
    if (!Array.isArray(value)) return [];

    const videos: LectureVideo[] = [];
    for (const item of value) {
        if (!isRecord(item)) continue;
        const title = typeof item.title === 'string' ? item.title : '';
        const url = typeof item.url === 'string' ? item.url : '';
        if (!url) continue;
        videos.push({ title, url });
    }
    return videos;
}
