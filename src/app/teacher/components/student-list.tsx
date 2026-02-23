'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateDisplay } from '@/components/ui/date-display';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';
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
    const handleNavigateToStudent = (studentId: string) => {
        router.push(`${linkPrefix}${studentId}`);
    };

    const handleInteractiveKeyDown = (event: KeyboardEvent<HTMLElement>, studentId: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleNavigateToStudent(studentId);
        }
    };

    const renderEmpty = () => (
        <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            条件に一致する生徒が見つかりません
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="space-y-3 md:hidden">
                {students.length === 0 ? (
                    renderEmpty()
                ) : (
                    students.map((student) => (
                        <div
                            key={student.id}
                            className={`rounded-lg border bg-card p-4 ${showDetailButton ? '' : 'cursor-pointer'}`}
                            role={showDetailButton ? undefined : 'link'}
                            tabIndex={showDetailButton ? undefined : 0}
                            onClick={showDetailButton ? undefined : () => handleNavigateToStudent(student.id)}
                            onKeyDown={showDetailButton ? undefined : (event) => handleInteractiveKeyDown(event, student.id)}
                        >
                            <div className="mb-3">
                                <p className="text-base font-semibold">{student.name || '未設定'}</p>
                                <p className="text-xs text-muted-foreground">{student.loginId}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">グループ</p>
                                    <p>{student.group || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">総回答数</p>
                                    <p>{student.stats.totalProblemsSolved}問</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">正答率</p>
                                    <p className={
                                        student.stats.accuracy >= 80 ? 'font-semibold text-green-600' :
                                            student.stats.accuracy < 50 ? 'font-semibold text-red-500' : ''
                                    }>
                                        {student.stats.accuracy}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">連続学習</p>
                                    <p>{student.stats.currentStreak}日</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-muted-foreground">最終学習日</p>
                                    <p>{student.stats.lastActivity ? <DateDisplay date={student.stats.lastActivity} /> : '-'}</p>
                                </div>
                            </div>
                            {showDetailButton && (
                                <div className="mt-3">
                                    <Button asChild variant="outline" size="sm" className="min-h-11 w-full">
                                        <Link href={`${linkPrefix}${student.id}`}>
                                            詳細を見る
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="hidden md:block">
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
                                role={showDetailButton ? undefined : 'link'}
                                tabIndex={showDetailButton ? undefined : 0}
                                onClick={showDetailButton ? undefined : () => handleNavigateToStudent(student.id)}
                                onKeyDown={showDetailButton ? undefined : (event) => handleInteractiveKeyDown(event, student.id)}
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
                                    {student.stats.lastActivity ? <DateDisplay date={student.stats.lastActivity} /> : '-'}
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
            </div>
        </div>
    );
}
