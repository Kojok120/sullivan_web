import { createAdminClient } from './supabase/admin';
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

const AUTH_RETRY_MAX_ATTEMPTS = 4;
const AUTH_RETRY_BASE_DELAY_MS = 200;

export interface SyncSupabaseAppMetadataParams {
    prismaUserId: string;
    loginId: string;
    role: Role;
    name: string;
}

function getRetryStatus(error: { status?: number } | null): number | null {
    if (!error) return null;
    return typeof error.status === 'number' ? error.status : null;
}

function isRetryableAuthStatus(status: number | null): boolean {
    if (status === null) return false;
    return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * iOS向けBearerトークンからSupabaseユーザーを取得する。
 * 429/5xx は指数バックオフで再試行する。
 */
export async function getSupabaseUserByAccessToken(token: string): Promise<{
    user: SupabaseUser | null;
    error: { message: string; status?: number } | null;
}> {
    const supabaseAdmin = createAdminClient();

    for (let attempt = 0; attempt < AUTH_RETRY_MAX_ATTEMPTS; attempt++) {
        const {
            data: { user },
            error,
        } = await supabaseAdmin.auth.getUser(token);

        if (!error) {
            return { user, error: null };
        }

        const status = getRetryStatus(error);
        const shouldRetry = isRetryableAuthStatus(status) && attempt < AUTH_RETRY_MAX_ATTEMPTS - 1;
        if (!shouldRetry) {
            console.error('[Supabase Admin getUser] failed', {
                attempt: attempt + 1,
                status,
                message: error.message,
            });
            return { user: null, error };
        }

        const backoff = AUTH_RETRY_BASE_DELAY_MS * (2 ** attempt);
        await delay(backoff);
    }

    return {
        user: null,
        error: {
            message: 'Supabase user lookup retry exhausted',
        },
    };
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

/**
 * Prisma 側のロール変更後に Supabase の app_metadata を同期する。
 */
export async function syncSupabaseAppMetadata({
    prismaUserId,
    loginId,
    role,
    name,
}: SyncSupabaseAppMetadataParams): Promise<{ success: boolean; error?: string }> {
    const supabaseAdmin = createAdminClient();
    const email = `${loginId}@sullivan-internal.local`;
    const targetUser = await findSupabaseUser({ email, prismaUserId });

    if (!targetUser) {
        return { success: false, error: 'Supabaseユーザーが見つかりません' };
    }

    const existingAppMetadata = (targetUser.app_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        app_metadata: {
            ...existingAppMetadata,
            role,
            loginId,
            name,
            prismaUserId,
        },
    });

    if (error) {
        console.error('Supabase app_metadata sync failed:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}
