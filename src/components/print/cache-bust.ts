function isAbsoluteUrl(url: string) {
    return /^https?:\/\//i.test(url);
}

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
