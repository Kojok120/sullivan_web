'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { isValidDateKey, parseDateKeyAsUTC } from '@/lib/date-key';

type SimpleCalendarProps = {
    value: string;
    onChange: (dateKey: string) => void;
    minDateKey?: string;
    className?: string;
};

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
    const t = useTranslations('SimpleCalendar');
    const [visibleMonth, setVisibleMonth] = useState<Date>(() => toMonthStart(value));

    const dateKeys = useMemo(() => getCalendarDateKeys(visibleMonth), [visibleMonth]);
    const currentMonth = visibleMonth.getUTCMonth();
    const weekDays = [t('weekDay.sun'), t('weekDay.mon'), t('weekDay.tue'), t('weekDay.wed'), t('weekDay.thu'), t('weekDay.fri'), t('weekDay.sat')];

    return (
        <div className={cn('rounded-md border bg-background p-3', className)}>
            <div className="mb-3 flex items-center justify-between">
                <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => {
                        setVisibleMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)));
                    }}
                >
                    {t('prevMonth')}
                </button>
                <div className="text-sm font-medium">{t('monthLabel', { year: visibleMonth.getUTCFullYear(), month: visibleMonth.getUTCMonth() + 1 })}</div>
                <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
                    onClick={() => {
                        setVisibleMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)));
                    }}
                >
                    {t('nextMonth')}
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {weekDays.map((day, index) => (
                    <div key={index} className="py-1">
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
                    {t('minDateNotice', { minDate: minDateKey })}
                </div>
            )}
        </div>
    );
}
