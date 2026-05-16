import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireProblemAuthor } from '@/lib/auth';
import { renderProblemTextHtml } from '@/lib/problem-text';

import { TEX_HELP_SECTIONS } from './tex-help-content';
import { TexHelpExampleCard } from './tex-help-example-card';

export const dynamic = 'force-dynamic';

export default async function ProblemAuthoringTeXHelpPage() {
    await requireProblemAuthor();
    const t = await getTranslations('TexHelp');

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold">{t('title')}</h1>
                <p className="text-sm leading-7 text-muted-foreground">
                    {t('intro.prefix')}<code>$...$</code>{t('intro.inlineSuffix')}<code>$$...$$</code>{t('intro.displaySuffix')}
                    {t('intro.examples')}
                </p>
            </div>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle>{t('rules.title')}</CardTitle>
                    <CardDescription>{t('rules.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7">
                    <ul className="list-disc space-y-2 pl-5">
                        <li>{t('rules.inlinePrefix')}<code>$...$</code>{t('rules.inlineSuffix')}</li>
                        <li>{t('rules.displayPrefix')}<code>$$...$$</code>{t('rules.displaySuffix')}</li>
                        <li>{t('rules.fractionPrefix')}<code>{t('rules.fractionCode')}</code>{t('rules.sqrtPrefix')}<code>{t('rules.sqrtCode')}</code>{t('rules.syntaxSuffix')}</li>
                        <li>{t('rules.powerPrefix')}<code>^</code>{t('rules.subscriptPrefix')}<code>_</code>{t('rules.groupPrefix')}<code>{t('rules.groupCode')}</code>{t('rules.groupSuffix')}</li>
                    </ul>
                    <div
                        className="rounded-md border bg-white p-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2"
                        dangerouslySetInnerHTML={{ __html: renderProblemTextHtml(t('rules.previewTex')) }}
                    />
                </CardContent>
            </Card>

            {TEX_HELP_SECTIONS.map((section) => (
                <section key={section.key} className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold">{t(section.titleKey)}</h2>
                        <p className="text-sm text-muted-foreground">{t(section.descriptionKey)}</p>
                    </div>
                    <div className="grid gap-4">
                        {section.examples.map((example) => (
                            <TexHelpExampleCard
                                key={`${section.key}-${example.key}`}
                                title={t(example.titleKey)}
                                description={t(example.descriptionKey)}
                                tex={t(example.texKey)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
