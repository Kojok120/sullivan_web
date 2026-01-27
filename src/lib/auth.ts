import { createClient } from '@/lib/supabase/server';
import * as bcrypt from 'bcryptjs';

export type SessionPayload = {
    userId: string;
    role: string;
    name: string;
};

// Deprecated functions (encrypt, decrypt, login) removed


export async function logout() {
    const supabase = await createClient();
    await supabase.auth.signOut();
}

export async function getSession(): Promise<SessionPayload | null> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return null;

        // SECURITY: Read from app_metadata (secure, server-only) strictly.
        // Fallback to user_metadata removed to prevent privilege escalation.
        const appMeta = user.app_metadata || {};
        const userMeta = user.user_metadata || {}; // Kept for 'name' if allowed

        return {
            userId: appMeta.prismaUserId || user.id, // removed userMeta.prismaUserId
            role: appMeta.role || 'STUDENT',         // removed userMeta.role
            name: appMeta.name || userMeta.name || '',
        };
    } catch (error) {
        return null;
    }
}

export async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
    return session;
}

export function isTeacherOrAdmin(session: SessionPayload | null): session is SessionPayload {
    return !!session && (session.role === 'TEACHER' || session.role === 'ADMIN');
}

export async function requireTeacherOrAdmin() {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
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
