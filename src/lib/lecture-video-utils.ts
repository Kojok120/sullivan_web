export type LectureVideoLike = {
    title: string;
    url: string;
};

export function normalizeLectureVideos<T extends LectureVideoLike>(videos?: T[]): LectureVideoLike[] {
    if (!videos) return [];
    return videos
        .map((video) => ({
            title: video.title.trim(),
            url: video.url.trim(),
        }))
        .filter((video) => video.title.length > 0 && video.url.length > 0);
}

export function parseLectureVideosFromJson(value: unknown): LectureVideoLike[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const videos: LectureVideoLike[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const title = typeof (entry as { title?: unknown }).title === 'string'
            ? (entry as { title: string }).title.trim()
            : '';
        const url = typeof (entry as { url?: unknown }).url === 'string'
            ? (entry as { url: string }).url.trim()
            : '';
        if (title && url) {
            videos.push({ title, url });
        }
    }

    return videos;
}

export function areLectureVideosEqual(a: LectureVideoLike[], b: LectureVideoLike[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((video, index) => {
        const target = b[index];
        return target && video.title === target.title && video.url === target.url;
    });
}
