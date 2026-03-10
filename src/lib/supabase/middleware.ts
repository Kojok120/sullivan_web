import { createServerClient } from '@supabase/ssr';
import { AuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

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

    return error instanceof AuthApiError
        && /invalid refresh token|refresh token not found/i.test(error.message);
}

export async function updateSession(request: NextRequest) {
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
