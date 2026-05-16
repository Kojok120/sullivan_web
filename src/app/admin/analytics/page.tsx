import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentsWithStats } from '@/lib/analytics';
import { StudentList } from '@/app/teacher/components/student-list';

export default async function AdminAnalyticsPage() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');
    const t = await getTranslations('AdminAnalyticsPage');

    // Fetch all students with stats
    const studentStats = await getStudentsWithStats();

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">{t('title')}</h1>

            <Card>
                <CardHeader>
                    <CardTitle>{t('studentListTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <StudentList
                        students={studentStats}
                        linkPrefix="/admin/analytics/"
                        showDetailButton={true}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
