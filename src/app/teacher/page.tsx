import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { getStudentsWithStats } from '@/lib/analytics';
import { Search } from 'lucide-react';
import { StudentList } from './components/student-list';
import { prisma } from '@/lib/prisma';
import { CreateUserDialog } from './components/create-user-dialog';

export default async function TeacherDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) redirect('/login');

    const { q: query } = await searchParams;

    const actor = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            classroomId: true,
            classroom: {
                select: {
                    groups: true,
                },
            },
        },
    });
    const studentStats = session.role === 'ADMIN'
        ? await getStudentsWithStats(query, 0, 50)
        : actor?.classroomId
            ? await getStudentsWithStats(query, 0, 50, actor.classroomId)
            : [];

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">講師用ダッシュボード</h1>

            <Card className="mb-8">
                <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>生徒検索</CardTitle>
                        {(session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') && (
                            <CreateUserDialog
                                canCreateTeacher={session.role === 'HEAD_TEACHER'}
                                groups={actor?.classroom?.groups || []}
                            />
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative w-full flex-1 sm:max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                name="q"
                                placeholder="名前、ID、グループで検索..."
                                className="pl-8"
                                defaultValue={query}
                            />
                        </div>
                        <Button type="submit" className="min-h-11 sm:min-h-10">検索</Button>
                        {query && (
                            <Button variant="ghost" asChild className="min-h-11 sm:min-h-10">
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
                    <StudentList students={studentStats} enableSorting />
                </CardContent>
            </Card>
        </div>
    );
}
