import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { getStudentsWithStats } from '@/lib/analytics';
import { Search } from 'lucide-react';

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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>名前</TableHead>
                                <TableHead>グループ</TableHead>
                                <TableHead className="text-right">総回答数</TableHead>
                                <TableHead className="text-right">正答率</TableHead>
                                <TableHead className="text-right">連続学習</TableHead>
                                <TableHead className="text-right">最終学習日</TableHead>
                                <TableHead className="text-right">詳細</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {studentStats.map((student) => (
                                <TableRow key={student.id}>
                                    <TableCell className="font-medium">
                                        <div>{student.name || '未設定'}</div>
                                        <div className="text-xs text-muted-foreground">{student.loginId}</div>
                                    </TableCell>
                                    <TableCell>{student.group?.name || '-'}</TableCell>
                                    <TableCell className="text-right">{student.stats.totalProblemsSolved}問</TableCell>
                                    <TableCell className="text-right">
                                        <span className={
                                            student.stats.accuracy >= 80 ? 'text-green-600 font-bold' :
                                                student.stats.accuracy < 50 ? 'text-red-500 font-bold' : ''
                                        }>
                                            {student.stats.accuracy}%
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">{student.stats.currentStreak}日</TableCell>
                                    <TableCell className="text-right">
                                        {student.stats.lastActivity ? new Date(student.stats.lastActivity).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/teacher/students/${student.id}`}>
                                                詳細
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {studentStats.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        条件に一致する生徒が見つかりません
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
