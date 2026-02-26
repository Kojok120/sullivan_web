import { redirect } from 'next/navigation';

import { RankingPageClient } from '@/components/ranking/ranking-page-client';
import { getSession } from '@/lib/auth';

export default async function StudentRankingPage() {
    const session = await getSession();
    if (!session) {
        redirect('/login');
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER' || session.role === 'ADMIN') {
        redirect('/teacher/ranking');
    }

    if (session.role !== 'STUDENT') {
        redirect('/login');
    }

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:py-8">
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="同じ教室の生徒ランキングです。問題数と英単語スコアの上位10人を、週・月ごとに表示します。"
            />
        </div>
    );
}
