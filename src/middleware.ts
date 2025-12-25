import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    const { supabaseResponse, user } = await updateSession(request);

    // Paths that don't require authentication
    const publicPaths = ['/login', '/signup'];
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

    // Force Password Change Check
    if (user && user.user_metadata?.isDefaultPassword) {
        if (!request.nextUrl.pathname.startsWith('/force-password-change')) {
            return NextResponse.redirect(new URL('/force-password-change', request.url));
        }
        return supabaseResponse;
    }

    // Prevent access to force-password-change if not required
    if (user && !user.user_metadata?.isDefaultPassword && request.nextUrl.pathname.startsWith('/force-password-change')) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // SECURITY: Read role from app_metadata (secure) with fallback to user_metadata for migration
    const userRole = user?.app_metadata?.role || user?.user_metadata?.role;

    // Admin routes check - must be authenticated AND have ADMIN role
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!user || userRole !== 'ADMIN') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return supabaseResponse;
    }

    // Teacher routes check - must be authenticated AND have TEACHER or ADMIN role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
        if (!user || (userRole !== 'TEACHER' && userRole !== 'ADMIN')) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return supabaseResponse;
    }

    if (!user && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (user && isPublicPath) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // Redirect ADMIN users from root to /admin
    if (user && userRole === 'ADMIN' && request.nextUrl.pathname === '/') {
        return NextResponse.redirect(new URL('/admin', request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|google.*\\.html).*)'],
};
