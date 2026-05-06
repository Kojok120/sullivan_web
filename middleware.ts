import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

// Supabase の cookie ベースセッションをページ／Route Handler 共通で更新する。
// updateSession が refresh エラーを内部で握り潰すため、ここでは単純に
// 返却された supabaseResponse をそのまま流す。
export async function middleware(request: NextRequest) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
}

export const config = {
    // 静的アセットと画像最適化リクエストには介入しない。
    // 画像系拡張子・フォント・css/js 等もまとめて除外する。
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|eot|otf)$).*)',
    ],
};
