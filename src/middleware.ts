import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    const { supabaseResponse, user } = await updateSession(request);

    // Paths that don't require authentication
    const publicPaths = ['/login', '/signup'];
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

    // Admin routes check - must be authenticated AND have ADMIN role
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!user || user.user_metadata?.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return supabaseResponse;
    }

    // Teacher routes check - must be authenticated AND have TEACHER or ADMIN role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
        if (!user || (user.user_metadata?.role !== 'TEACHER' && user.user_metadata?.role !== 'ADMIN')) {
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

    return supabaseResponse;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
