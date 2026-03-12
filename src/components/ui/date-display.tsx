import { FALLBACK_TIME_ZONE, normalizeTimeZone } from '@/lib/date-key';

interface DateDisplayProps {
    date: Date | string | number | null | undefined;
    showTime?: boolean;
    className?: string;
    timeZone?: string;
}

export function DateDisplay({ date, showTime = false, className, timeZone }: DateDisplayProps) {
    if (!date) return <span className={className}>-</span>;

    const d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>-</span>;

    const resolvedTimeZone = normalizeTimeZone(timeZone) || FALLBACK_TIME_ZONE;
    const dateStr = d.toLocaleDateString('ja-JP', { timeZone: resolvedTimeZone });

    if (!showTime) {
        return <span className={className}>{dateStr}</span>;
    }

    const timeStr = d.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: resolvedTimeZone
    });

    return (
        <span className={className}>
            {dateStr} <span className="text-muted-foreground text-xs ml-1">{timeStr}</span>
        </span>
    );
}
