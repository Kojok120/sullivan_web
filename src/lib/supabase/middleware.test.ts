import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    getUserMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: createServerClientMock,
}));

import { updateSession } from '@/lib/supabase/middleware';

function createRequest() {
    const request = new NextRequest('http://localhost/teacher');
    request.cookies.set('sb-test-auth-token', 'access-token');
    request.cookies.set('sb-test-auth-token.0', 'refresh-token');
    request.cookies.set('other-cookie', 'keep-me');
    return request;
}

function expectAuthCookiesCleared(request: NextRequest, setCookieHeader: string) {
    expect(request.cookies.get('sb-test-auth-token')).toBeUndefined();
    expect(request.cookies.get('sb-test-auth-token.0')).toBeUndefined();
    expect(request.cookies.get('other-cookie')?.value).toBe('keep-me');
    expect(setCookieHeader).toMatch(/sb-test-auth-token=;[^]*?(Max-Age=0|Expires=Thu, 01 Jan 1970 00:00:00 GMT)/i);
    expect(setCookieHeader).toMatch(/sb-test-auth-token\.0=;[^]*?(Max-Age=0|Expires=Thu, 01 Jan 1970 00:00:00 GMT)/i);
}

describe('supabase middleware', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
        createServerClientMock.mockReturnValue({
            auth: {
                getUser: getUserMock,
            },
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        createServerClientMock.mockReset();
        getUserMock.mockReset();
    });

    it('正常なユーザーはそのまま返す', async () => {
        const user = { id: 'user-1' };
        getUserMock.mockResolvedValue({
            data: { user },
            error: null,
        });

        const result = await updateSession(createRequest());

        expect(result.user).toEqual(user);
        expect(result.supabaseResponse.headers.get('set-cookie')).toBeNull();
    });

    it('invalid refresh token は cookie を削除して未ログイン扱いにする', async () => {
        getUserMock.mockRejectedValue(
            new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
        );

        const request = createRequest();
        const result = await updateSession(request);

        expect(result.user).toBeNull();
        const setCookieHeader = result.supabaseResponse.headers.get('set-cookie') ?? '';
        expectAuthCookiesCleared(request, setCookieHeader);
    });

    it('plain object の AuthApiError でも cookie を削除して未ログイン扱いにする', async () => {
        const request = createRequest();
        getUserMock.mockResolvedValue({
            data: { user: null },
            error: {
                __isAuthError: true,
                name: 'AuthApiError',
                message: 'Invalid Refresh Token: Refresh Token Not Found',
                status: 400,
                code: 'refresh_token_not_found',
            },
        });

        const result = await updateSession(request);

        expect(result.user).toBeNull();
        const setCookieHeader = result.supabaseResponse.headers.get('set-cookie') ?? '';
        expectAuthCookiesCleared(request, setCookieHeader);
    });

    it('refresh_token_already_used も cookie を削除して未ログイン扱いにする', async () => {
        const request = createRequest();
        getUserMock.mockRejectedValue({
            __isAuthError: true,
            name: 'AuthApiError',
            message: 'Invalid Refresh Token: Already Used',
            status: 400,
            code: 'refresh_token_already_used',
        });

        const result = await updateSession(request);

        expect(result.user).toBeNull();
        const setCookieHeader = result.supabaseResponse.headers.get('set-cookie') ?? '';
        expectAuthCookiesCleared(request, setCookieHeader);
    });

    it('AuthSessionMissingError が戻り値 error に入る場合も cookie を削除して未ログイン扱いにする', async () => {
        const request = createRequest();
        getUserMock.mockResolvedValue({
            data: { user: null },
            error: new AuthSessionMissingError(),
        });

        const result = await updateSession(request);

        expect(result.user).toBeNull();
        const setCookieHeader = result.supabaseResponse.headers.get('set-cookie') ?? '';
        expectAuthCookiesCleared(request, setCookieHeader);
    });

    it('AuthSessionMissingError が throw される場合も cookie を削除して未ログイン扱いにする', async () => {
        const request = createRequest();
        getUserMock.mockRejectedValue(new AuthSessionMissingError());

        const result = await updateSession(request);

        expect(result.user).toBeNull();
        const setCookieHeader = result.supabaseResponse.headers.get('set-cookie') ?? '';
        expectAuthCookiesCleared(request, setCookieHeader);
    });

    it('refresh token 以外の AuthApiError は再送出する', async () => {
        getUserMock.mockRejectedValue(
            new AuthApiError('User from sub claim in JWT does not exist', 403, 'user_not_found'),
        );

        await expect(updateSession(createRequest())).rejects.toThrow(
            'User from sub claim in JWT does not exist',
        );
    });
});
