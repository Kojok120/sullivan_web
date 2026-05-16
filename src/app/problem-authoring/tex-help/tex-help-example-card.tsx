'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { renderProblemTextHtml } from '@/lib/problem-text';

type TexHelpExampleCardProps = {
    title: string;
    description: string;
    tex: string;
};

export function TexHelpExampleCard({
    title,
    description,
    tex,
}: TexHelpExampleCardProps) {
    const t = useTranslations('TexHelp.exampleCard');
    const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');

    useEffect(() => {
        if (copyState === 'idle') {
            return;
        }

        const timeoutId = window.setTimeout(() => setCopyState('idle'), 1600);
        return () => window.clearTimeout(timeoutId);
    }, [copyState]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(tex);
            setCopyState('success');
        } catch {
            setCopyState('error');
        }
    };

    return (
        <Card className="shadow-none">
            <CardHeader className="space-y-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-base">{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={handleCopy}>
                        {copyState === 'success' ? t('copySuccess') : copyState === 'error' ? t('copyError') : t('copyIdle')}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">{t('inputLabel')}</div>
                    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                        <code>{tex}</code>
                    </pre>
                </div>
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">{t('previewLabel')}</div>
                    <div
                        className="rounded-md border bg-white p-3 text-sm leading-7 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2"
                        dangerouslySetInnerHTML={{ __html: renderProblemTextHtml(tex) }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
