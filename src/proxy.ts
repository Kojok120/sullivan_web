import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PRINT_PAGE_PATTERN = /^\/teacher\/students\/[^/]+\/print(?:\/)?$/;
const NO_STORE_HEADERS = {
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
} as const;

function isPrintPagePath(pathname: string) {
    return pathname === '/dashboard/print' || PRINT_PAGE_PATTERN.test(pathname);
}

function applyNoStoreHeaders(response: NextResponse) {
    Object.entries(NO_STORE_HEADERS).forEach(([name, value]) => {
        response.headers.set(name, value);
    });

    return response;
}

export async function proxy(request: NextRequest) {
    const { supabaseResponse, user } = await updateSession(request);
    const maybeApplyNoStoreHeaders = (response: NextResponse) =>
        isPrintPagePath(request.nextUrl.pathname)
            ? applyNoStoreHeaders(response)
            : response;

    // Paths that don't require authentication
    const publicPaths = ['/login', '/signup'];
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

    // Force Password Change Check
    if (user && user.user_metadata?.isDefaultPassword) {
        if (!request.nextUrl.pathname.startsWith('/force-password-change')) {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/force-password-change', request.url)));
        }
        return maybeApplyNoStoreHeaders(supabaseResponse);
    }

    // Prevent access to force-password-change if not required
    if (user && !user.user_metadata?.isDefaultPassword && request.nextUrl.pathname.startsWith('/force-password-change')) {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
    }

    // SECURITY: Read role from app_metadata (secure) with fallback to user_metadata for migration
    const userRole = user?.app_metadata?.role;

    // Admin routes check - must be authenticated AND have ADMIN role
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!user || userRole !== 'ADMIN') {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
        }
        return maybeApplyNoStoreHeaders(supabaseResponse);
    }

    // Teacher routes check - must be authenticated AND have TEACHER/HEAD_TEACHER or ADMIN role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
        if (!user || (userRole !== 'TEACHER' && userRole !== 'HEAD_TEACHER' && userRole !== 'ADMIN')) {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
        }
        return maybeApplyNoStoreHeaders(supabaseResponse);
    }

    if (!user && !isPublicPath) {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/login', request.url)));
    }

    if (user && isPublicPath) {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
    }

    // Redirect ADMIN users from root to /admin
    if (user && userRole === 'ADMIN' && request.nextUrl.pathname === '/') {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/admin', request.url)));
    }

    // Redirect TEACHER/HEAD_TEACHER users from root to /teacher
    if (user && (userRole === 'TEACHER' || userRole === 'HEAD_TEACHER') && request.nextUrl.pathname === '/') {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/teacher', request.url)));
    }

    return maybeApplyNoStoreHeaders(supabaseResponse);
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|google.*\\.html).*)'],
};
