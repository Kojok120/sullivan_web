// iOS用JWT認証ヘルパー
// Authorization: Bearer <token> からユーザー情報を取得

import { getSupabaseUserByAccessToken } from '@/lib/auth-admin';
import type { SessionPayload } from '@/lib/auth';

const ALLOWED_ROLES = ['STUDENT', 'TEACHER', 'HEAD_TEACHER', 'PARENT', 'ADMIN', 'MATERIAL_AUTHOR'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

function isAllowedRole(value: unknown): value is AllowedRole {
    return typeof value === 'string' && ALLOWED_ROLES.includes(value as AllowedRole);
}

function normalizeRole(value: unknown): AllowedRole {
    return isAllowedRole(value) ? value : 'STUDENT';
}

/**
 * iOSアプリからのリクエストに含まれるJWTトークンを検証し、セッション情報を返す
 * @param request Request
 * @returns セッション情報（null の場合は認証失敗）
 */
async function getSessionFromBearer(
    request: Request
): Promise<SessionPayload | null> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return null;
    }

    const [scheme, token] = authHeader.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    try {
        const { user, error } = await getSupabaseUserByAccessToken(token);

        if (error || !user) {
            return null;
        }

        const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
        const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const role = normalizeRole(appMeta.role);
        const userId =
            typeof appMeta.prismaUserId === 'string' && appMeta.prismaUserId.length > 0
                ? appMeta.prismaUserId
                : user.id;
        const name =
            typeof appMeta.name === 'string'
                ? appMeta.name
                : (typeof userMeta.name === 'string' ? userMeta.name : '');

        return {
            userId,
            role,
            name,
        };
    } catch {
        return null;
    }
}

/**
 * iOSアプリからのリクエストを認証する
 * まずBearerトークンを試み、なければcookieベースのセッションにフォールバック
 */
export async function getSessionForMobile(
    request: Request
): Promise<SessionPayload | null> {
    const hasAuthorizationHeader = request.headers.has('authorization');

    // Bearerトークンを優先
    const bearerSession = await getSessionFromBearer(request);
    if (bearerSession) {
        return bearerSession;
    }

    if (hasAuthorizationHeader) {
        return null;
    }

    // フォールバック: 通常のcookieベースセッション
    const { getSession } = await import('@/lib/auth');
    return getSession();
}
