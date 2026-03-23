type Props = {
    data: { date: string; count: number }[];
    days?: number;
};

type HeatmapCell = {
    date: string;
    count: number;
} | null;

const DEFAULT_HEATMAP_DAYS = 365;
const MAX_HEATMAP_DAYS = 3650;

export function Heatmap({ data, days = 365 }: Props) {
    const normalizedDays = Number.isFinite(days) ? Math.floor(days) : DEFAULT_HEATMAP_DAYS;
    const totalDays = Math.min(MAX_HEATMAP_DAYS, Math.max(1, normalizedDays));
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (totalDays - 1));

    const dataMap = new Map<string, number>();
    data.forEach(d => dataMap.set(d.date, d.count));

    const currentResponseDate = new Date(startDate);
    const startDay = startDate.getDay();
    const weeks: HeatmapCell[][] = [];
    let currentWeek: HeatmapCell[] = [];

    for (let i = 0; i < startDay; i++) {
        currentWeek.push(null);
    }

    for (let i = 0; i < totalDays; i++) {
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
        // 残りの日を埋める
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
        <div className="overflow-x-auto pb-2">
            <div className="flex w-max gap-0.5 sm:gap-1">
                {weeks.map((week, wIndex) => (
                    <div key={wIndex} className="flex flex-col gap-0.5 sm:gap-1">
                        {week.map((day, dIndex) => (
                            <div
                                key={dIndex}
                                title={day ? `${day.date}: ${day.count}問` : ''}
                                className={`h-2.5 w-2.5 rounded-[2px] sm:h-3 sm:w-3 sm:rounded-sm ${day ? getColor(day.count) : 'bg-transparent'}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
