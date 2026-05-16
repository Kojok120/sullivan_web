'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function TeXHelpLink() {
    const t = useTranslations('TexHelpLink');

    return (
        <Link
            href="/problem-authoring/tex-help"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-600 underline underline-offset-4"
        >
            {t('label')}
        </Link>
    );
}
