import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';

const ALG = 'HS256';

function getSecretKey() {
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        // During build time (static generation), this might be called if pages use auth logic.
        // However, we shouldn't throw if we can avoid it, or throw only when actually needed.
        if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
            return new TextEncoder().encode('build-time-secret');
        }
        // Fallback for strictness at runtime
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    return new TextEncoder().encode(secretKey);
}


export type SessionPayload = {
    userId: string;
    role: string;
    name: string;
};

export async function encrypt(payload: SessionPayload) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime('7d') // Session lasts 7 days
        .sign(getSecretKey());
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(input, getSecretKey(), {
            algorithms: [ALG],
        });
        return payload as SessionPayload;
    } catch (error) {
        return null;
    }
}

export async function login(payload: SessionPayload) {
    const session = await encrypt(payload);
    const cookieStore = await cookies();

    cookieStore.set('session', session, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.set('session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
    });
}

export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!session) return null;
    return await decrypt(session);
}

export async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
    return session;
}

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}
