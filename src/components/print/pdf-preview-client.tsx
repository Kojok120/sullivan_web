'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

type AutoPrintState = 'idle' | 'running' | 'requested' | 'failed';

type PdfPreviewClientProps = {
    pdfUrl: string;
    autoPrint: boolean;
};

export function PdfPreviewClient({ pdfUrl, autoPrint }: PdfPreviewClientProps) {
    const router = useRouter();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [isFrameLoaded, setIsFrameLoaded] = useState(false);
    const [autoPrintState, setAutoPrintState] = useState<AutoPrintState>('idle');
    const hasAutoPrintedRef = useRef(false);

    const triggerPrint = useCallback(() => {
        const frame = iframeRef.current;
        if (!frame) {
            setAutoPrintState('failed');
            return false;
        }

        const frameWindow = frame.contentWindow;
        if (!frameWindow) {
            setAutoPrintState('failed');
            return false;
        }

        try {
            frameWindow.focus();
            frameWindow.print();
            setAutoPrintState('requested');
            return true;
        } catch {
            setAutoPrintState('failed');
            return false;
        }
    }, []);

    useEffect(() => {
        if (!autoPrint) return;
        if (!isFrameLoaded) return;
        if (hasAutoPrintedRef.current) return;

        hasAutoPrintedRef.current = true;

        const timer = window.setTimeout(() => {
            const ok = triggerPrint();
            if (!ok) {
                setAutoPrintState('failed');
            }
        }, 350);

        return () => {
            window.clearTimeout(timer);
        };
    }, [autoPrint, isFrameLoaded, triggerPrint]);

    return (
        <div className="min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            戻る
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                const ok = triggerPrint();
                                if (!ok) {
                                    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                                }
                            }}
                            disabled={!isFrameLoaded}
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            印刷する
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {!isFrameLoaded && <Loader2 className="h-4 w-4 animate-spin" />}
                        {autoPrintState === 'running' && '印刷ダイアログを起動しています...'}
                        {autoPrintState === 'requested' && '自動印刷を試行しました。表示されない場合は「印刷する」を押してください。'}
                        {autoPrintState === 'failed' && '自動印刷に失敗しました。手動で印刷してください。'}
                        {autoPrintState === 'idle' && 'PDFを読み込み中です...'}
                    </div>

                    <Button
                        variant="ghost"
                        asChild
                    >
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                            PDFを別タブで開く
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>

                <div className="rounded-md border bg-white shadow-sm">
                    <iframe
                        ref={iframeRef}
                        title="印刷プレビュー"
                        src={pdfUrl}
                        className="h-[calc(100vh-130px)] w-full rounded-md"
                        onLoad={() => {
                            setIsFrameLoaded(true);
                            if (autoPrint && autoPrintState === 'idle') {
                                setAutoPrintState('running');
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
