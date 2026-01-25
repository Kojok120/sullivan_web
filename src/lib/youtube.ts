/**
 * YouTube URLからビデオIDを抽出します。
 * 対応フォーマット:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - VIDEO_ID (11桁のID直接文字列)
 */
export function getYouTubeId(url: string | null | undefined): string | null {
    if (!url) return null;

    // 11桁のIDのみの場合はそのまま返す
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }

    // youtu.be
    if (url.includes('youtu.be')) {
        return url.split('/').pop()?.split('?')[0] || null;
    }

    // youtube.com
    if (url.includes('youtube.com')) {
        // embed
        const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch) return embedMatch[1];

        // watch?v=
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('v');
        } catch {
            // URL解析失敗時のフォールバック (正規表現)
            const vMatch = url.match(/[?&]v=([^&]+)/);
            return vMatch ? vMatch[1] : null;
        }
    }

    return null;
}

/**
 * YouTubeの埋め込みURLを取得します。
 * YouTube以外のURLの場合はそのまま返します。
 */
export function getEmbedUrl(url: string): string {
    const id = getYouTubeId(url);
    if (id) {
        return `https://www.youtube.com/embed/${id}`;
    }
    return url;
}
