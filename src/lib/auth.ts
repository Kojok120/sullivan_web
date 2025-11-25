import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';

const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
    throw new Error('JWT_SECRET is not defined in environment variables');
}
const SECRET_KEY = new TextEncoder().encode(secretKey);
const ALG = 'HS256';

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
        .sign(SECRET_KEY);
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(input, SECRET_KEY, {
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
        secure: process.env.NODE_ENV === 'production',
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        path: '/',
    });
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.set('session', '', { expires: new Date(0) });
}

export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!session) return null;
    return await decrypt(session);
}

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}
