import { createClient } from './supabase/server';
import { cache } from 'react';
import { isAdminRole, isProblemAuthorRole, isTeacherOrAdminRole } from './authorization';

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

// React cache でメモ化: 同一リクエスト内の複数呼び出しを1回に削減
export const getSession = cache(async (): Promise<SessionPayload | null> => {
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
    } catch {
        return null;
    }
});

// Server Components / Server Actions での利用名を統一するためのエイリアス
export const getCurrentUser = getSession;

export async function requireAdmin() {
    const session = await getSession();
    if (!session || !isAdminRole(session.role)) {
        throw new Error('Unauthorized');
    }
    return session;
}

export async function requireProblemAuthor() {
    const session = await getSession();
    if (!session || !isProblemAuthorRole(session.role)) {
        throw new Error('Unauthorized');
    }
    return session;
}

export function isTeacherOrAdmin(session: SessionPayload | null): session is SessionPayload {
    return !!session && isTeacherOrAdminRole(session.role);
}
