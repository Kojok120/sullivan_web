'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentStats } from '@/lib/analytics';
import { User } from '@prisma/client';

type StudentWithStats = User & {
    group: string | null;
    stats: StudentStats;
};

interface StudentListProps {
    students: StudentWithStats[];
    /** リンク先のプレフィックス（デフォルト: '/teacher/students/'） */
    linkPrefix?: string;
    /** 詳細ボタンを表示するか（デフォルト: false、クリックでナビゲーション） */
    showDetailButton?: boolean;
}

export function StudentList({
    students,
    linkPrefix = '/teacher/students/',
    showDetailButton = false,
}: StudentListProps) {
    const router = useRouter();

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>名前</TableHead>
                    <TableHead>グループ</TableHead>
                    <TableHead className="text-right">総回答数</TableHead>
                    <TableHead className="text-right">正答率</TableHead>
                    <TableHead className="text-right">連続学習</TableHead>
                    <TableHead className="text-right">最終学習日</TableHead>
                    {showDetailButton && <TableHead className="text-right">詳細</TableHead>}
                </TableRow>
            </TableHeader>
            <TableBody>
                {students.map((student) => (
                    <TableRow
                        key={student.id}
                        className={showDetailButton ? '' : 'cursor-pointer hover:bg-muted/50 transition-colors'}
                        onClick={showDetailButton ? undefined : () => router.push(`${linkPrefix}${student.id}`)}
                    >
                        <TableCell className="font-medium">
                            <div>{student.name || '未設定'}</div>
                            <div className="text-xs text-muted-foreground">{student.loginId}</div>
                        </TableCell>
                        <TableCell>{student.group || '-'}</TableCell>
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
                            {student.stats.lastActivity ? new Date(student.stats.lastActivity).toLocaleDateString('ja-JP') : '-'}
                        </TableCell>
                        {showDetailButton && (
                            <TableCell className="text-right">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`${linkPrefix}${student.id}`}>
                                        詳細を見る
                                    </Link>
                                </Button>
                            </TableCell>
                        )}
                    </TableRow>
                ))}
                {students.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={showDetailButton ? 7 : 6} className="text-center py-8 text-muted-foreground">
                            条件に一致する生徒が見つかりません
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}
