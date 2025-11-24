import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getStudentStats, getStudentsWithStats } from '@/lib/analytics';

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
                                    <TableCell className="font-medium">{student.name || student.loginId}</TableCell>
                                    <TableCell>{student.group?.name || '-'}</TableCell>
                                    <TableCell className="text-right">{student.stats.totalProblemsSolved}問</TableCell>
                                    <TableCell className="text-right">{student.stats.accuracy}%</TableCell>
                                    <TableCell className="text-right">{student.stats.currentStreak}日</TableCell>
                                    <TableCell className="text-right">
                                        {student.stats.lastActivity ? new Date(student.stats.lastActivity).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/admin/analytics/${student.id}`}>
                                                詳細を見る
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {studentStats.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        生徒が見つかりません
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
