'use client';

import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePrintNavigation } from '@/hooks/use-print-navigation';

type HtmlPrintClientProps = {
    backFallbackPath: string;
    pdfUrl: string;
};

export function HtmlPrintClient({ backFallbackPath, pdfUrl }: HtmlPrintClientProps) {
    const { handleBack } = usePrintNavigation(backFallbackPath);

    return (
        <div className="print-toolbar mx-auto flex w-full max-w-[1200px] flex-col gap-3 rounded-md bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    戻る
                </Button>
                <Button
                    type="button"
                    onClick={() => {
                        window.print();
                    }}
                >
                    <Printer className="mr-2 h-4 w-4" />
                    印刷する
                </Button>
            </div>

            <div className="text-sm text-muted-foreground">
                スマホ・タブレットではこの画面から印刷してください。
            </div>

            <Button variant="ghost" asChild>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    PDFを開く
                    <ExternalLink className="ml-2 h-4 w-4" />
                </a>
            </Button>
        </div>
    );
}
