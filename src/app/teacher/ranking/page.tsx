import { redirect } from 'next/navigation';

import { RankingPageClient } from '@/components/ranking/ranking-page-client';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';

export default async function TeacherRankingPage() {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        redirect('/login');
    }
    const t = await getTranslations('StudentRanking');

    const isAdmin = session.role === 'ADMIN';
    const classrooms = isAdmin
        ? await prisma.classroom.findMany({
            where: { packId: session.defaultPackId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        })
        : [];

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:py-8">
            <RankingPageClient
                apiPath="/api/rankings"
                heading={t('heading')}
                description={t('description')}
                showClassroomSelector={isAdmin}
                classrooms={classrooms}
            />
        </div>
    );
}
