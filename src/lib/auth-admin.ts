import { createAdminClient } from '@/lib/supabase/admin';
import { Role } from '@prisma/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface CreateSupabaseUserParams {
    email: string;
    password: string;
    role: Role;
    loginId: string;
    name: string;
    prismaUserId: string;
}

type SupabaseUserLookup = {
    email?: string;
    prismaUserId?: string;
};

export async function createOrUpdateSupabaseUser({
    email,
    password,
    role,
    loginId,
    name,
    prismaUserId,
}: CreateSupabaseUserParams) {
    const supabaseAdmin = createAdminClient();

    // 新規作成を試す
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

    // 既存ユーザーがいる場合は更新
    if (createError.code === 'email_exists') {
        const existing = await findSupabaseUser({
            email,
            prismaUserId,
        });

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
 * lookupキーで Supabase ユーザーを検索する（ページング対応）。
 * `prismaUserId` を優先し、次に `email` を照合する。
 */
export async function findSupabaseUser({ email, prismaUserId }: SupabaseUserLookup): Promise<SupabaseUser | null> {
    if (!email && !prismaUserId) return null;

    const supabaseAdmin = createAdminClient();
    const normalizedEmail = email?.toLowerCase();

    let page = 1;
    const perPage = 200;

    while (true) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
        });

        if (error || !users || users.length === 0) {
            break;
        }

        const found = users.find((u) => {
            const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
            const matchedByPrismaUserId =
                prismaUserId !== undefined && appMeta.prismaUserId === prismaUserId;
            const matchedByEmail =
                normalizedEmail !== undefined && (u.email || '').toLowerCase() === normalizedEmail;
            return matchedByPrismaUserId || matchedByEmail;
        });
        if (found) return found;

        if (users.length < perPage) {
            break;
        }

        page++;
    }

    return null;
}

/**
 * lookupキーに一致する Supabase ユーザーを削除する。
 * 一致しない場合は削除済み扱い（成功）で返す。
 */
export async function deleteSupabaseUserByLookup(
    lookup: SupabaseUserLookup
): Promise<{ success: boolean; deleted: boolean; error?: string }> {
    const supabaseAdmin = createAdminClient();
    const targetUser = await findSupabaseUser(lookup);

    if (!targetUser) {
        return { success: true, deleted: false };
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUser.id);
    if (error) {
        console.error('Supabaseユーザー削除に失敗しました:', error);
        return { success: false, deleted: false, error: error.message };
    }

    return { success: true, deleted: true };
}
