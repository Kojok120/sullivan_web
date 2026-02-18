'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
    data: { date: string; count: number }[];
};

export function Heatmap({ data }: Props) {
    // Generate last 365 days
    const days = 365;
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);

    // Map data for quick lookup
    const dataMap = new Map<string, number>();
    data.forEach(d => dataMap.set(d.date, d.count));

    let currentResponseDate = new Date(startDate);

    // Adjust start date to align with Sunday (optional, for GitHub style layout)
    // For simplicity, just horizontal flex or grid wrapped.
    // GitHub uses a vertical column for each week.

    // Simple implementation: Grid with 7 rows (days of week) and 52 columns?
    // Or just a flex wrap of squares.
    // Let's try to mimic GitHub: Columns are weeks, Rows are days (Sun-Sat).

    // 1. Calculate offset to start on correct day of week
    const startDay = startDate.getDay(); // 0 = Sun, 1 = Mon...

    // We want 53 columns (weeks) x 7 rows.
    const weeks = [];
    let currentWeek = [];

    // Fill initial empty days
    for (let i = 0; i < startDay; i++) {
        currentWeek.push(null);
    }

    for (let i = 0; i <= days; i++) {
        const dateStr = currentResponseDate.toISOString().split('T')[0];
        const count = dataMap.get(dateStr) || 0;

        currentWeek.push({ date: dateStr, count });

        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }

        currentResponseDate.setDate(currentResponseDate.getDate() + 1);
    }
    if (currentWeek.length > 0) {
        // Fill remaining days
        while (currentWeek.length < 7) {
            currentWeek.push(null);
        }
        weeks.push(currentWeek);
    }

    const getColor = (count: number) => {
        if (count === 0) return 'bg-gray-100';
        if (count <= 2) return 'bg-green-200';
        if (count <= 5) return 'bg-green-400';
        if (count <= 10) return 'bg-green-600';
        return 'bg-green-800';
    };

    return (
        <Card className="w-full overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">学習ヒートマップ (過去1年)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex gap-1 overflow-x-auto pb-2">
                    {weeks.map((week, wIndex) => (
                        <div key={wIndex} className="flex flex-col gap-1">
                            {week.map((day, dIndex) => (
                                <div
                                    key={dIndex}
                                    title={day ? `${day.date}: ${day.count}問` : ''}
                                    className={`w-3 h-3 rounded-sm ${day ? getColor(day.count) : 'bg-transparent'}`}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
