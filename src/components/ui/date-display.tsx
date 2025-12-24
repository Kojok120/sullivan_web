interface DateDisplayProps {
    date: Date | string | number | null | undefined;
    showTime?: boolean;
    className?: string;
}

export function DateDisplay({ date, showTime = false, className }: DateDisplayProps) {
    if (!date) return <span className={className}>-</span>;

    const d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>-</span>;

    const dateStr = d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

    if (!showTime) {
        return <span className={className}>{dateStr}</span>;
    }

    const timeStr = d.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo'
    });

    return (
        <span className={className}>
            {dateStr} <span className="text-muted-foreground text-xs ml-1">{timeStr}</span>
        </span>
    );
}
