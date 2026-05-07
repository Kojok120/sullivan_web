'use client';

import { renderProblemTextHtml } from '@/lib/problem-text';

const DEFAULT_CLASSNAME =
    'rounded-md border bg-white p-3 text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2';

export function ProblemTextPreview({
    text,
    emptyMessage = '本文を入力すると、ここに表示確認が出ます。',
    className,
}: {
    text: string;
    emptyMessage?: string;
    /**
     * 上書き用クラス。指定するとボーダー・背景なしに切り替えたい場合などに有用。
     * デフォルトはエディタ表示用の枠付きスタイル。
     */
    className?: string;
}) {
    if (!text.trim()) {
        return <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{emptyMessage}</div>;
    }

    return (
        <div
            className={className ?? DEFAULT_CLASSNAME}
            dangerouslySetInnerHTML={{ __html: renderProblemTextHtml(text) }}
        />
    );
}
