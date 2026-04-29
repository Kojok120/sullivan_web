'use client';

import { renderProblemTextHtml } from '@/lib/problem-text';

export function ProblemTextPreview({
    text,
    emptyMessage = '本文を入力すると、ここに表示確認が出ます。',
}: {
    text: string;
    emptyMessage?: string;
}) {
    if (!text.trim()) {
        return <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{emptyMessage}</div>;
    }

    return (
        <div
            className="rounded-md border bg-white p-3 text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2"
            dangerouslySetInnerHTML={{ __html: renderProblemTextHtml(text) }}
        />
    );
}
