'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateDisplay } from '@/components/ui/date-display';
import { SortIcon } from '@/components/ui/sort-icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import type { StudentStats } from '@/lib/analytics';
import type { User } from '@prisma/client';
import {
    DEFAULT_STUDENT_SORT_ORDER,
    type StudentSortKey,
    type StudentSortOrder,
    STUDENT_SORT_OPTIONS,
} from './student-list-sort';

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
    /** ソートUIを表示するか（デフォルト: false） */
    enableSorting?: boolean;
    /** 現在のソートキー */
    sortBy?: StudentSortKey | null;
    /** 現在のソート順 */
    sortOrder?: StudentSortOrder;
}

export function StudentList({
    students,
    linkPrefix = '/teacher/students/',
    showDetailButton = false,
    enableSorting = false,
    sortBy = null,
    sortOrder = 'asc',
}: StudentListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentSortBy = enableSorting ? sortBy : null;
    const currentSortOrder = currentSortBy ? sortOrder : 'asc';

    const handleNavigateToStudent = (studentId: string) => {
        router.push(`${linkPrefix}${studentId}`);
    };

    const handleInteractiveKeyDown = (event: KeyboardEvent<HTMLElement>, studentId: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleNavigateToStudent(studentId);
        }
    };

    const updateSortParams = (nextSortBy: StudentSortKey | null, nextSortOrder: StudentSortOrder) => {
        const params = new URLSearchParams(searchParams.toString());

        if (nextSortBy) {
            params.set('sortBy', nextSortBy);
            params.set('sortOrder', nextSortOrder);
        } else {
            params.delete('sortBy');
            params.delete('sortOrder');
        }

        const nextQuery = params.toString();
        router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    };

    const handleSort = (column: StudentSortKey) => {
        if (!enableSorting) return;

        if (currentSortBy === column) {
            updateSortParams(column, currentSortOrder === 'asc' ? 'desc' : 'asc');
            return;
        }

        updateSortParams(column, DEFAULT_STUDENT_SORT_ORDER[column]);
    };

    const handleSortSelection = (value: string) => {
        if (value === 'default') {
            updateSortParams(null, 'asc');
            return;
        }

        // STUDENT_SORT_OPTIONS 由来の値のみを受け取るため、StudentSortKey への変換は安全。
        const nextSortBy = value as StudentSortKey;
        updateSortParams(nextSortBy, DEFAULT_STUDENT_SORT_ORDER[nextSortBy]);
    };

    const toggleSortOrder = () => {
        if (!currentSortBy) return;
        updateSortParams(currentSortBy, currentSortOrder === 'asc' ? 'desc' : 'asc');
    };

    const renderSortableHead = (
        label: string,
        column: StudentSortKey,
        align: 'left' | 'right' = 'left',
    ) => {
        const isActive = currentSortBy === column;
        const ariaSort = isActive ? (currentSortOrder === 'asc' ? 'ascending' : 'descending') : 'none';

        if (!enableSorting) {
            return <TableHead className={align === 'right' ? 'text-right' : undefined}>{label}</TableHead>;
        }

        return (
            <TableHead aria-sort={ariaSort} className={align === 'right' ? 'text-right' : undefined}>
                <button
                    type="button"
                    className={cn(
                        'inline-flex w-full items-center gap-1 font-medium hover:text-foreground',
                        align === 'right' ? 'justify-end' : 'justify-start',
                    )}
                    onClick={() => handleSort(column)}
                >
                    <span>{label}</span>
                    <SortIcon active={isActive} sortOrder={currentSortOrder} className="ml-1" />
                    {isActive && (
                        <span className="text-xs text-muted-foreground" aria-hidden="true">
                            {currentSortOrder === 'asc' ? '昇' : '降'}
                        </span>
                    )}
                </button>
            </TableHead>
        );
    };

    const renderEmpty = () => (
        <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            条件に一致する生徒が見つかりません
        </div>
    );

    return (
        <div className="space-y-3">
            {enableSorting && (
                <div className="flex items-center gap-2 md:hidden">
                    <Select value={currentSortBy ?? 'default'} onValueChange={handleSortSelection}>
                        <SelectTrigger className="w-full bg-background">
                            <SelectValue placeholder="並び順" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">標準（現在の表示順）</SelectItem>
                            {STUDENT_SORT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-20"
                        onClick={toggleSortOrder}
                        disabled={!currentSortBy}
                    >
                        {currentSortOrder === 'asc' ? '昇順' : '降順'}
                    </Button>
                </div>
            )}

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
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">生徒ID</p>
                                    <p>{student.loginId}</p>
                                </div>
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
                            {renderSortableHead('生徒ID', 'loginId')}
                            <TableHead>グループ</TableHead>
                            {renderSortableHead('総回答数', 'totalProblemsSolved', 'right')}
                            <TableHead className="text-right">正答率</TableHead>
                            {renderSortableHead('連続学習', 'currentStreak', 'right')}
                            {renderSortableHead('最終学習日', 'lastActivity', 'right')}
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
                                    {student.name || '未設定'}
                                </TableCell>
                                <TableCell>{student.loginId}</TableCell>
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
                                <TableCell colSpan={showDetailButton ? 8 : 7} className="text-center py-8 text-muted-foreground">
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
