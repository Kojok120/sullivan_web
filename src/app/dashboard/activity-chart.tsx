'use client';

import dynamic from 'next/dynamic';

interface ActivityChartProps {
    data: {
        date: string;
        count: number;
    }[];
}

// recharts は重量級の依存（描画処理に SVG 計測ロジックが含まれ window を必要とする）。
// SSR 段階ではバンドルに含めず、ブラウザでチャート描画が実際に必要になった時点で
// 動的ロードする。
const ActivityChartImpl = dynamic(
    () => import('./activity-chart-impl').then((mod) => mod.ActivityChartImpl),
    {
        ssr: false,
        loading: () => (
            <div className="h-[350px] w-full animate-pulse rounded bg-muted" />
        ),
    },
);

export function ActivityChart(props: ActivityChartProps) {
    return <ActivityChartImpl {...props} />;
}
