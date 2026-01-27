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
        const existing = await findSupabaseUserByEmail(email);

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

/**
 * Finds a Supabase user by email with pagination support.
 * Essential for apps with > 50 users (default limit).
 */
export async function findSupabaseUserByEmail(email: string) {
    const supabaseAdmin = createAdminClient();
    const normalizedEmail = email.toLowerCase();

    let page = 1;
    const perPage = 50; // Use default or manageable chunk
    let hasMore = true;

    // TODO: Ideally we should use search if supported, or rely on ID mapping.
    // Since listUsers doesn't support email filter on server-side JS client easily (unlike generic filtering),
    // we paginate. 
    // Optimization: If we have thousands of users, this is still O(N).
    // A better approach in the future is to store `supabase_id` in Prisma `User` table.

    while (hasMore) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
        });

        if (error || !users || users.length === 0) {
            break;
        }

        const found = users.find(u => (u.email || '').toLowerCase() === normalizedEmail);
        if (found) return found;

        if (users.length < perPage) {
            hasMore = false;
        } else {
            page++;
        }

        // Safety break to prevent infinite loops or timeout on really large DBs without better search
        if (page > 50) {
            console.warn('findSupabaseUserByEmail: Exceeded 50 pages search limit. User might not be found.');
            break;
        }
    }

    return null;
}
