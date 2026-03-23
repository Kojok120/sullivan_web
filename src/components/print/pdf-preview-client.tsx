'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';

import { appendCacheBust } from '@/components/print/cache-bust';
import { Button } from '@/components/ui/button';
import { usePrintNavigation } from '@/hooks/use-print-navigation';
import { type PrintView } from '@/lib/print-view';

type PdfPreviewClientProps = {
    pdfUrl: string;
    assistViewUrl?: string;
    htmlViewUrl?: string;
    backFallbackPath: string;
    preferredPrintView?: PrintView;
};

const RESTORE_RELOAD_THROTTLE_MS = 250;

export function PdfPreviewClient({
    pdfUrl,
    assistViewUrl,
    htmlViewUrl,
    backFallbackPath,
    preferredPrintView,
}: PdfPreviewClientProps) {
    return (
        <PdfPreviewClientInner
            key={pdfUrl}
            pdfUrl={pdfUrl}
            assistViewUrl={assistViewUrl}
            htmlViewUrl={htmlViewUrl}
            backFallbackPath={backFallbackPath}
            preferredPrintView={preferredPrintView}
        />
    );
}

function PdfPreviewClientInner({
    pdfUrl,
    assistViewUrl,
    htmlViewUrl,
    backFallbackPath,
    preferredPrintView = 'pdf',
}: PdfPreviewClientProps) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const hasLoadedFrameRef = useRef(false);
    const lastReloadAtRef = useRef(0);
    const [frameUrl, setFrameUrl] = useState(pdfUrl);
    const [isFrameLoaded, setIsFrameLoaded] = useState(false);
    const prefersAssistView = preferredPrintView === 'assist' && Boolean(assistViewUrl);
    const prefersHtmlPrintView = preferredPrintView === 'html' && Boolean(htmlViewUrl);
    const { handleBack } = usePrintNavigation(backFallbackPath);

    const triggerPrint = useCallback(() => {
        const frame = iframeRef.current;
        if (!frame) {
            return false;
        }

        const frameWindow = frame.contentWindow;
        if (!frameWindow) {
            return false;
        }

        try {
            frameWindow.focus();
            frameWindow.print();
            return true;
        } catch {
            return false;
        }
    }, []);

    const reloadFrame = useCallback(() => {
        const now = Date.now();
        if (now - lastReloadAtRef.current < RESTORE_RELOAD_THROTTLE_MS) {
            return;
        }

        lastReloadAtRef.current = now;
        hasLoadedFrameRef.current = false;
        setIsFrameLoaded(false);
        setFrameUrl(appendCacheBust(pdfUrl));
    }, [pdfUrl]);

    useEffect(() => {
        const handlePageShow = (event: PageTransitionEvent) => {
            if (!event.persisted || !hasLoadedFrameRef.current) {
                return;
            }

            reloadFrame();
        };

        window.addEventListener('pageshow', handlePageShow);
        return () => {
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, [reloadFrame]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible' || !hasLoadedFrameRef.current) {
                return;
            }

            reloadFrame();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [reloadFrame]);

    if (prefersAssistView && assistViewUrl) {
        return (
            <div className="min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
                    <div className="rounded-md bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={handleBack}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    戻る
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <h1 className="text-lg font-semibold">iPhone・iPad では印刷アシストを開いてください</h1>
                                <p className="text-sm text-muted-foreground">
                                    埋め込みプレビューでは印刷しづらいため、共有メニューを開ける専用画面へ移動します。
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button asChild>
                                    <a href={assistViewUrl}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        印刷アシストを開く
                                    </a>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <a href={frameUrl}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        PDFを開く
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (prefersHtmlPrintView && htmlViewUrl) {
        return (
            <div className="min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
                    <div className="rounded-md bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={handleBack}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    戻る
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <h1 className="text-lg font-semibold">スマホでは専用の印刷画面を開いてください</h1>
                                <p className="text-sm text-muted-foreground">
                                    PDF 埋め込みプレビューはスマホ・タブレットで正しく印刷できない場合があります。
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button asChild>
                                    <a href={htmlViewUrl}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        印刷ページで開く
                                    </a>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <a href={frameUrl} target="_blank" rel="noopener noreferrer">
                                        PDFを別タブで開く
                                        <ExternalLink className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={handleBack}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            戻る
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                const ok = triggerPrint();
                                if (!ok) {
                                    window.open(frameUrl, '_blank', 'noopener,noreferrer');
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
                        {isFrameLoaded
                            ? 'プレビューを確認して「印刷する」を押してください。'
                            : 'PDFを読み込み中です...'}
                    </div>

                    <Button
                        variant="ghost"
                        asChild
                    >
                        <a href={frameUrl} target="_blank" rel="noopener noreferrer">
                            PDFを別タブで開く
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>

                <div className="rounded-md border bg-white shadow-sm">
                    <iframe
                        ref={iframeRef}
                        title="印刷プレビュー"
                        src={frameUrl}
                        className="h-[calc(100vh-130px)] w-full rounded-md"
                        onLoad={() => {
                            hasLoadedFrameRef.current = true;
                            setIsFrameLoaded(true);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
