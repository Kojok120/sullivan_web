// iOS用: 英単語データ取得API
// GET /api/ios/vocabulary
// Authorization: Bearer <supabase_jwt>

import { NextRequest, NextResponse } from 'next/server';
import { getSessionForMobile } from '@/lib/auth-mobile';
import vocabularyDataJson from '@/lib/vocabulary-data.json';

const ALLOWED_ROLES = new Set(['STUDENT']);
type VocabularyLevel = 'beginner' | 'intermediate' | 'advanced';

type VocabularyEntry = {
    id: string;
    english: string;
    japanese: string;
    level: VocabularyLevel;
};

// 英単語データ（iOSアプリ同梱JSONと同一内容）
const vocabularyData = vocabularyDataJson as VocabularyEntry[];

export async function GET(request: NextRequest) {
    const session = await getSessionForMobile(request);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const level = request.nextUrl.searchParams.get('level');

        let filteredData = vocabularyData;
        if (level && ['beginner', 'intermediate', 'advanced'].includes(level)) {
            filteredData = vocabularyData.filter((w) => w.level === level);
        }

        return NextResponse.json(filteredData);
    } catch (error) {
        console.error('[iOS Vocabulary API] エラー:', error);
        return NextResponse.json(
            { error: '英単語データの取得に失敗しました' },
            { status: 500 }
        );
    }
}
