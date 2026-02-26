// iOS用JWT認証ヘルパー
// Authorization: Bearer <token> からユーザー情報を取得

import { createAdminClient } from '@/lib/supabase/admin';
import type { SessionPayload } from '@/lib/auth';

/**
 * iOSアプリからのリクエストに含まれるJWTトークンを検証し、セッション情報を返す
 * @param request NextRequest
 * @returns セッション情報（null の場合は認証失敗）
 */
export async function getSessionFromBearer(
    request: Request
): Promise<SessionPayload | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice(7);
    if (!token) {
        return null;
    }

    try {
        const supabaseAdmin = createAdminClient();
        const {
            data: { user },
            error,
        } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return null;
        }

        const appMeta = user.app_metadata || {};
        const userMeta = user.user_metadata || {};

        return {
            userId: appMeta.prismaUserId || user.id,
            role: appMeta.role || 'STUDENT',
            name: appMeta.name || userMeta.name || '',
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
    // Bearerトークンを優先
    const bearerSession = await getSessionFromBearer(request);
    if (bearerSession) {
        return bearerSession;
    }

    // フォールバック: 通常のcookieベースセッション
    const { getSession } = await import('@/lib/auth');
    return getSession();
}
