import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentsWithStats } from '@/lib/analytics';
import { StudentList } from '@/app/teacher/components/student-list';

export default async function AdminAnalyticsPage() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');

    // Fetch all students with stats
    const studentStats = await getStudentsWithStats();

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8">学習状況分析</h1>

            <Card>
                <CardHeader>
                    <CardTitle>生徒一覧</CardTitle>
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
