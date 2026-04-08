import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireProblemAuthor } from '@/lib/auth';
import { renderProblemTextHtml } from '@/lib/problem-text';

import { TEX_HELP_SECTIONS } from './tex-help-content';
import { TexHelpExampleCard } from './tex-help-example-card';

export default async function ProblemAuthoringTeXHelpPage() {
    await requireProblemAuthor();

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold">TeX数式の書き方ヘルプ</h1>
                <p className="text-sm leading-7 text-muted-foreground">
                    この editor では、本文中で <code>$...$</code> が文中数式、<code>$$...$$</code> が独立数式です。
                    問題文カードにそのままコピペできる例を載せています。
                </p>
            </div>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle>まず覚えるルール</CardTitle>
                    <CardDescription>最初にここだけ押さえておけば、基本的な数式はすぐ書けます。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7">
                    <ul className="list-disc space-y-2 pl-5">
                        <li>文章の中に短い数式を入れるときは <code>$...$</code> を使います。</li>
                        <li>1行で独立して見せたい式は <code>$$...$$</code> を使います。</li>
                        <li>分数は <code>\frac&#123;分子&#125;&#123;分母&#125;</code>、平方根は <code>\sqrt&#123;...&#125;</code> です。</li>
                        <li>累乗は <code>^</code>、下付きは <code>_</code> を使います。複数文字は <code>&#123;...&#125;</code> で囲みます。</li>
                    </ul>
                    <div
                        className="rounded-md border bg-white p-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2"
                        dangerouslySetInnerHTML={{ __html: renderProblemTextHtml('例: 点Aの座標は $(-2, 3)$ です。\n$$y = x^2 - 4x + 3$$') }}
                    />
                </CardContent>
            </Card>

            {TEX_HELP_SECTIONS.map((section) => (
                <section key={section.title} className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold">{section.title}</h2>
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                    <div className="grid gap-4">
                        {section.examples.map((example) => (
                            <TexHelpExampleCard
                                key={`${section.title}-${example.title}`}
                                title={example.title}
                                description={example.description}
                                tex={example.tex}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
