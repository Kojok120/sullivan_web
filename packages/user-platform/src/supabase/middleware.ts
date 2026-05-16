import { createServerClient } from '@supabase/ssr';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const RECOVERABLE_AUTH_SESSION_ERROR_CODES = new Set([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_expired',
]);

const RECOVERABLE_AUTH_SESSION_ERROR_NAMES = new Set([
    'AuthSessionMissingError',
    'AuthApiError',
]);

const RECOVERABLE_AUTH_SESSION_ERROR_MESSAGE_REGEX =
    /invalid refresh token|refresh token not found|refresh token already used|session expired|auth session missing/i;

export function looksLikeRecoverableAuthError(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as { __isAuthError?: unknown; name?: unknown; code?: unknown; message?: unknown };
    if (candidate.__isAuthError !== true) {
        return false;
    }

    const errorName = typeof candidate.name === 'string' ? candidate.name : '';
    if (errorName && !RECOVERABLE_AUTH_SESSION_ERROR_NAMES.has(errorName)) {
        return false;
    }

    // code が明示されていれば code だけで判定する（message へフォールバックしない）。
    // isRecoverableAuthSessionError と挙動を揃え、無関係な error が message regex に
    // 偶然マッチして抑制対象になる事故を防ぐ。
    const errorCode = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
    if (errorCode) {
        return RECOVERABLE_AUTH_SESSION_ERROR_CODES.has(errorCode);
    }

    const message = typeof candidate.message === 'string' ? candidate.message : '';
    return RECOVERABLE_AUTH_SESSION_ERROR_MESSAGE_REGEX.test(message);
}

// Supabase Auth SDK 内部の console.error が、updateSession 側で握り潰している
// 失効済み refresh token を Cloud Run などに ERROR として漏らしてしまう。
// 静的なパターンで該当エラーだけ抑制する。それ以外のログには影響しない。
// import 時点で console.error を差し替えるとテスト環境を含む全プロセスに副作用が
// 漏れるため、updateSession の初回実行時に lazy にパッチする。
let consoleErrorPatched = false;
export function patchConsoleErrorOnce() {
    if (consoleErrorPatched) {
        return;
    }
    consoleErrorPatched = true;

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        if (args.some(looksLikeRecoverableAuthError)) {
            return;
        }
        originalConsoleError(...args);
    };
}

function isSupabaseAuthCookieName(name: string) {
    return name.startsWith('sb-') && name.includes('-auth-token');
}

function clearSupabaseAuthCookies(request: NextRequest) {
    const authCookieNames = request.cookies
        .getAll()
        .map(({ name }) => name)
        .filter(isSupabaseAuthCookieName);

    authCookieNames.forEach((name) => {
        request.cookies.delete(name);
    });

    const response = NextResponse.next({
        request,
    });

    authCookieNames.forEach((name) => {
        response.cookies.delete(name);
    });

    return response;
}

function isRecoverableAuthSessionError(error: unknown) {
    if (isAuthSessionMissingError(error)) {
        return true;
    }

    if (!isAuthApiError(error)) {
        return looksLikeRecoverableAuthError(error);
    }

    const errorCode = typeof error.code === 'string'
        ? error.code.toLowerCase()
        : '';

    if (errorCode) {
        return RECOVERABLE_AUTH_SESSION_ERROR_CODES.has(errorCode);
    }

    return RECOVERABLE_AUTH_SESSION_ERROR_MESSAGE_REGEX.test(error.message);
}

export async function updateSession(request: NextRequest) {
    patchConsoleErrorOnce();

    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (isRecoverableAuthSessionError(error)) {
            return {
                supabaseResponse: clearSupabaseAuthCookies(request),
                user: null,
                supabase,
            };
        }

        if (error) {
            throw error;
        }

        return { supabaseResponse, user, supabase };
    } catch (error) {
        // 失効済み refresh token は未ログイン扱いに戻して先へ進める。
        if (isRecoverableAuthSessionError(error)) {
            return {
                supabaseResponse: clearSupabaseAuthCookies(request),
                user: null,
                supabase,
            };
        }

        throw error;
    }
}
