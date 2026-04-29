import { redirect } from 'next/navigation';

import { RankingPageClient } from '@/components/ranking/ranking-page-client';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function TeacherRankingPage() {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        redirect('/login');
    }

    const isAdmin = session.role === 'ADMIN';
    const classrooms = isAdmin
        ? await prisma.classroom.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        })
        : [];

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:py-8">
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="同じ教室の生徒ランキングです。問題数・英単語スコア・正答率の上位10人を、今月・3ヶ月・1年・自由指定で表示します。"
                showClassroomSelector={isAdmin}
                classrooms={classrooms}
            />
        </div>
    );
}
