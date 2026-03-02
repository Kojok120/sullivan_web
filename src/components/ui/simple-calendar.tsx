'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { isValidDateKey, parseDateKeyAsUTC } from '@/lib/date-key';

type SimpleCalendarProps = {
    value: string;
    onChange: (dateKey: string) => void;
    minDateKey?: string;
    className?: string;
};

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toMonthStart(dateKey: string): Date {
    const date = isValidDateKey(dateKey) ? parseDateKeyAsUTC(dateKey) : new Date();
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date) {
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
}

function getCalendarDateKeys(monthStart: Date): string[] {
    const firstWeekday = monthStart.getUTCDay();
    const gridStart = new Date(monthStart);
    gridStart.setUTCDate(1 - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(gridStart);
        day.setUTCDate(gridStart.getUTCDate() + index);
        return formatDateKey(day);
    });
}

export function SimpleCalendar({ value, onChange, minDateKey, className }: SimpleCalendarProps) {
    const [visibleMonth, setVisibleMonth] = useState<Date>(() => toMonthStart(value));

    const dateKeys = useMemo(() => getCalendarDateKeys(visibleMonth), [visibleMonth]);
    const currentMonth = visibleMonth.getUTCMonth();

    return (
        <div className={cn('rounded-md border bg-background p-3 shadow-sm', className)}>
            <div className="mb-3 flex items-center justify-between">
                <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => {
                        setVisibleMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)));
                    }}
                >
                    前月
                </button>
                <div className="text-sm font-medium">{getMonthLabel(visibleMonth)}</div>
                <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => {
                        setVisibleMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)));
                    }}
                >
                    次月
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {WEEK_DAYS.map((day) => (
                    <div key={day} className="py-1">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {dateKeys.map((dateKey) => {
                    const date = parseDateKeyAsUTC(dateKey);
                    const isCurrentMonth = date.getUTCMonth() === currentMonth;
                    const isSelected = value === dateKey;
                    const isDisabled = !!minDateKey && dateKey < minDateKey;

                    return (
                        <button
                            key={dateKey}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onChange(dateKey)}
                            className={cn(
                                'h-9 rounded-md text-sm transition-colors',
                                isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/60',
                                isSelected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-accent',
                                isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                            )}
                        >
                            {date.getUTCDate()}
                        </button>
                    );
                })}
            </div>

            {minDateKey && (
                <div className="mt-2 text-xs text-muted-foreground">
                    {minDateKey} 以前は選択できません
                </div>
            )}
        </div>
    );
}
