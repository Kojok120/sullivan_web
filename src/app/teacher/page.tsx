import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// Table imports removed as they are unused
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { getStudentsWithStats } from '@/lib/analytics';
import { Search } from 'lucide-react';
import { StudentList } from './components/student-list';

export default async function TeacherDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) redirect('/login');

    const { q: query } = await searchParams;

    // Fetch students with stats in one go
    const studentStats = await getStudentsWithStats(query);

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8">講師用ダッシュボード</h1>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>生徒検索</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="flex gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                name="q"
                                placeholder="名前、ID、グループで検索..."
                                className="pl-8"
                                defaultValue={query}
                            />
                        </div>
                        <Button type="submit">検索</Button>
                        {query && (
                            <Button variant="ghost" asChild>
                                <Link href="/teacher">クリア</Link>
                            </Button>
                        )}
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>生徒一覧 ({studentStats.length}名)</CardTitle>
                </CardHeader>
                <CardContent>
                    <StudentList students={studentStats} />
                </CardContent>
            </Card>
        </div>
    );
}
