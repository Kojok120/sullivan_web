import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from './lib/auth';

export async function middleware(request: NextRequest) {
    const cookie = request.cookies.get('session')?.value;
    const session = cookie ? await decrypt(cookie) : null;
    console.log(`Middleware: ${request.nextUrl.pathname}, Session: ${session?.userId}, Role: ${session?.role}`);

    // Paths that don't require authentication
    const publicPaths = ['/login', '/signup'];
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

    // Admin routes check - must be authenticated AND have ADMIN role
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // Teacher routes check - must be authenticated AND have TEACHER or ADMIN role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
        if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    if (!session && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (session && isPublicPath) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
