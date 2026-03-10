import type { NextResponse } from 'next/server';

export const NO_STORE_HEADERS = {
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
} as const;

export function applyNoStoreHeaders<T extends NextResponse>(response: T) {
    Object.entries(NO_STORE_HEADERS).forEach(([name, value]) => {
        response.headers.set(name, value);
    });

    return response;
}

export function withNoStoreHeaders(headersInit?: HeadersInit) {
    const headers = new Headers(headersInit);

    Object.entries(NO_STORE_HEADERS).forEach(([name, value]) => {
        headers.set(name, value);
    });

    return headers;
}
