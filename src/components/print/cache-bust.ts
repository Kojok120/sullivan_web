function isAbsoluteUrl(url: string) {
    return /^https?:\/\//i.test(url);
}

/**
 * キャッシュ無効化用の一意なトークンを生成する。
 * 返却値は `<timestamp>-<8文字の英数字>` 形式で、URL やファイル名のクエリ値に利用できる。
 */
export function createCacheBustToken() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function appendCacheBust(url: string, token: string = createCacheBustToken()) {
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.set('cb', token);

    if (isAbsoluteUrl(url)) {
        return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
