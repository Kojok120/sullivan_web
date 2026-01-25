import { createAdminClient } from '@/lib/supabase/admin';
import { Role } from '@prisma/client';

export interface CreateSupabaseUserParams {
    email: string;
    password: string;
    role: Role;
    loginId: string;
    name: string;
    prismaUserId: string;
}

export async function createOrUpdateSupabaseUser({
    email,
    password,
    role,
    loginId,
    name,
    prismaUserId,
}: CreateSupabaseUserParams) {
    const supabaseAdmin = createAdminClient();

    // Try to create the user
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
            role,
            loginId,
            name,
            prismaUserId,
        },
        user_metadata: {
            isDefaultPassword: true,
        },
    });

    if (!createError) {
        return { success: true };
    }

    // If user exists, try to update
    if (createError.code === 'email_exists') {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
        });

        if (listError || !listData?.users) {
            console.error('Supabase listUsers failed:', listError);
            return { error: 'Failed to check existing user' };
        }

        const normalizedEmail = email.toLowerCase();
        const existing = listData.users.find(
            (u) => (u.email || '').toLowerCase() === normalizedEmail
        );

        if (!existing) {
            console.error('Supabase user not found for email:', email);
            return { error: 'User conflict but not found' };
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existing.id,
            {
                password,
                email_confirm: true,
                app_metadata: {
                    role,
                    loginId,
                    name,
                    prismaUserId,
                },
                user_metadata: {
                    ...(existing.user_metadata || {}),
                    isDefaultPassword: true,
                },
            }
        );

        if (updateError) {
            console.error('Supabase update failed:', updateError);
            return { error: 'Failed to update existing user' };
        }

        return { success: true };
    }

    console.error('Supabase registration failed:', createError);
    return { error: createError.message };
}
