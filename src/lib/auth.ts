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

        return {
            userId: user.user_metadata.prismaUserId || user.id, // Fallback to user.id (UUID) only if metadata is missing, but should be prismaUserId (CUID)
            role: user.user_metadata.role || 'STUDENT',
            name: user.user_metadata.name || '',
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

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}
