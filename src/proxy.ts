import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyNoStoreHeaders } from '@/lib/no-store';
import { updateSession } from '@/lib/supabase/middleware';

const PRINT_PAGE_PATTERN = /^\/teacher\/students\/[^/]+\/print(?:\/)?$/;
const DASHBOARD_PRINT_PAGE_PATTERN = /^\/dashboard\/print(?:\/)?$/;
const MATERIAL_AUTHOR_ALLOWED_PATH_PREFIXES = ['/materials', '/problem-authoring'] as const;

function isPrintPagePath(pathname: string) {
    return DASHBOARD_PRINT_PAGE_PATTERN.test(pathname) || PRINT_PAGE_PATTERN.test(pathname);
}

function isAllowedMaterialAuthorPath(pathname: string) {
    return MATERIAL_AUTHOR_ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function withRequestPathnameHeader(request: NextRequest, response: NextResponse) {
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set('x-pathname', request.nextUrl.pathname);

    const nextResponse = NextResponse.next({
        request: {
            headers: forwardedHeaders,
        },
    });

    for (const [key, value] of response.headers.entries()) {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey === 'set-cookie' || normalizedKey.startsWith('x-middleware-')) {
            continue;
        }
        nextResponse.headers.set(key, value);
    }

    for (const cookie of response.headers.getSetCookie()) {
        nextResponse.headers.append('set-cookie', cookie);
    }

    return nextResponse;
}

export async function proxy(request: NextRequest) {
    const { supabaseResponse, user } = await updateSession(request);
    const continueResponse = withRequestPathnameHeader(request, supabaseResponse);
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
        return maybeApplyNoStoreHeaders(continueResponse);
    }

    // Prevent access to force-password-change if not required
    if (user && !user.user_metadata?.isDefaultPassword && request.nextUrl.pathname.startsWith('/force-password-change')) {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
    }

    // SECURITY: Read role from app_metadata (secure) with fallback to user_metadata for migration
    const userRole = user?.app_metadata?.role;

    // Admin routes check - must be authenticated AND have ADMIN role
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!user) {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/login', request.url)));
        }
        if (userRole === 'MATERIAL_AUTHOR') {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/materials/problems', request.url)));
        }
        if (userRole !== 'ADMIN') {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
        }
        return maybeApplyNoStoreHeaders(continueResponse);
    }

    if (request.nextUrl.pathname.startsWith('/materials')) {
        if (!user) {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/login', request.url)));
        }
        if (userRole !== 'MATERIAL_AUTHOR' && userRole !== 'ADMIN') {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
        }
        return maybeApplyNoStoreHeaders(continueResponse);
    }

    // Teacher routes check - must be authenticated AND have TEACHER/HEAD_TEACHER or ADMIN role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
        if (!user) {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/login', request.url)));
        }
        if (userRole !== 'TEACHER' && userRole !== 'HEAD_TEACHER' && userRole !== 'ADMIN') {
            return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/', request.url)));
        }
        return maybeApplyNoStoreHeaders(continueResponse);
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

    if (user && userRole === 'MATERIAL_AUTHOR' && request.nextUrl.pathname === '/') {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/materials/problems', request.url)));
    }

    // Redirect TEACHER/HEAD_TEACHER users from root to /teacher
    if (user && (userRole === 'TEACHER' || userRole === 'HEAD_TEACHER') && request.nextUrl.pathname === '/') {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/teacher', request.url)));
    }

    if (
        user
        && userRole === 'MATERIAL_AUTHOR'
        && !isAllowedMaterialAuthorPath(request.nextUrl.pathname)
        && !request.nextUrl.pathname.startsWith('/force-password-change')
        && !isPublicPath
    ) {
        return maybeApplyNoStoreHeaders(NextResponse.redirect(new URL('/materials/problems', request.url)));
    }

    return maybeApplyNoStoreHeaders(continueResponse);
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|google.*\\.html).*)'],
};
