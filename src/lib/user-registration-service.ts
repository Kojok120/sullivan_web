import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { createOrUpdateSupabaseUser } from '@/lib/auth-admin';
import { createUser as createPrismaUser } from '@/lib/user-service';
import crypto from 'crypto';

export interface RegisterUserParams {
    name: string;
    role: Role;
    password?: string;
    group?: string;
    classroomId?: string;
}

/**
 * Registers a new user internally (Prisma) and in Supabase Auth.
 * Handles rollback if Supabase registration fails.
 */
export async function registerUser({
    name,
    role,
    password,
    group,
    classroomId
}: RegisterUserParams) {
    // 1. Determine password (using crypto.randomBytes for security)
    const finalPassword = password || crypto.randomBytes(8).toString('base64url').slice(0, 12);

    // 2. Create User in Prisma
    let user;
    try {
        user = await createPrismaUser({
            name,
            role,
            group,
            classroomId
        });
    } catch (e) {
        console.error('Prisma user creation failed:', e);
        return { error: 'ユーザーの作成に失敗しました(DB)' };
    }

    // 3. Register in Supabase
    const email = `${user.loginId}@sullivan-internal.local`;

    const authResult = await createOrUpdateSupabaseUser({
        email,
        password: finalPassword,
        role: user.role,
        loginId: user.loginId,
        name: user.name || '',
        prismaUserId: user.id
    });

    if (authResult.error) {
        // Rollback: Delete Prisma user if Supabase registration fails
        try {
            await prisma.user.delete({ where: { id: user.id } });
            console.log(`Rolled back user ${user.id} due to Supabase error.`);
        } catch (rollbackError) {
            console.error('Critical: Failed to rollback user creation:', rollbackError);
        }

        console.error('Supabase registration failed:', authResult.error);
        return { error: `Auth作成失敗: ${authResult.error}` };
    }

    return { success: true, user, password: finalPassword };
}
