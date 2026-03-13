import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { getStudentsWithStats } from '@/lib/analytics';
import { Search } from 'lucide-react';
import { StudentList } from './components/student-list';
import {
    DEFAULT_STUDENT_SORT_ORDER,
    sortStudents,
    STUDENT_SORT_OPTIONS,
    type StudentSortKey,
    type StudentSortOrder,
} from './components/student-list-sort';
import { prisma } from '@/lib/prisma';
import { CreateUserDialog } from './components/create-user-dialog';

const DEFAULT_STUDENT_LIST_TAKE = 50;
const MAX_SORT_FETCH = 500;

function isStudentSortKey(value: string | undefined): value is StudentSortKey {
    return STUDENT_SORT_OPTIONS.some((option) => option.value === value);
}

export default async function TeacherDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; sortBy?: string; sortOrder?: string }>;
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) redirect('/login');

    const { q: query, sortBy: rawSortBy, sortOrder: rawSortOrder } = await searchParams;
    const sortBy = isStudentSortKey(rawSortBy) ? rawSortBy : null;
    const sortOrder: StudentSortOrder = rawSortOrder === 'desc'
        ? 'desc'
        : sortBy
            ? DEFAULT_STUDENT_SORT_ORDER[sortBy]
            : 'asc';

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
    const classroomId = session.role === 'ADMIN' ? undefined : actor?.classroomId ?? null;
    const canLoadStudents = session.role === 'ADMIN' || Boolean(classroomId);
    const studentWhere = canLoadStudents ? {
        role: 'STUDENT' as const,
        classroomId: classroomId ?? undefined,
        OR: query ? [
            { name: { contains: query, mode: 'insensitive' as const } },
            { loginId: { contains: query, mode: 'insensitive' as const } },
            { group: { contains: query, mode: 'insensitive' as const } },
        ] : undefined,
    } : null;
    const totalStudentCount = studentWhere
        ? await prisma.user.count({ where: studentWhere })
        : 0;
    const take = sortBy ? Math.min(MAX_SORT_FETCH, totalStudentCount || MAX_SORT_FETCH) : DEFAULT_STUDENT_LIST_TAKE;
    const studentStats = !canLoadStudents
        ? []
        : session.role === 'ADMIN'
            ? await getStudentsWithStats(query, 0, take)
            : await getStudentsWithStats(query, 0, take, classroomId);
    const sortedStudentStats = sortBy
        ? sortStudents(studentStats, sortBy, sortOrder)
        : studentStats;
    const isSortResultLimited = Boolean(sortBy) && totalStudentCount > MAX_SORT_FETCH;

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
                        {sortBy && <input type="hidden" name="sortBy" value={sortBy} />}
                        {sortBy && <input type="hidden" name="sortOrder" value={sortOrder} />}
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
                    <CardTitle>生徒一覧 ({sortedStudentStats.length}名表示)</CardTitle>
                    {isSortResultLimited && (
                        <p className="text-sm text-muted-foreground">
                            並び替え中は最大 {MAX_SORT_FETCH} 名まで表示しています。検索条件に一致する生徒は全 {totalStudentCount} 名です。
                        </p>
                    )}
                </CardHeader>
                <CardContent>
                    <StudentList
                        students={sortedStudentStats}
                        enableSorting
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
