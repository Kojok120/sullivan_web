'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';

import { appendCacheBust } from '@/components/print/cache-bust';
import { Button } from '@/components/ui/button';
import { getPreferredPrintView } from '@/lib/print-view';

type PdfPreviewClientProps = {
    pdfUrl: string;
    htmlViewUrl?: string;
    backFallbackPath: string;
};

const RESTORE_RELOAD_THROTTLE_MS = 250;

export function PdfPreviewClient({ pdfUrl, htmlViewUrl, backFallbackPath }: PdfPreviewClientProps) {
    return (
        <PdfPreviewClientInner
            key={pdfUrl}
            pdfUrl={pdfUrl}
            htmlViewUrl={htmlViewUrl}
            backFallbackPath={backFallbackPath}
        />
    );
}

function PdfPreviewClientInner({ pdfUrl, htmlViewUrl, backFallbackPath }: PdfPreviewClientProps) {
    const router = useRouter();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const closeFallbackTimerRef = useRef<number | null>(null);
    const hasLoadedFrameRef = useRef(false);
    const lastReloadAtRef = useRef(0);
    const [frameUrl, setFrameUrl] = useState(pdfUrl);
    const [isFrameLoaded, setIsFrameLoaded] = useState(false);
    const prefersHtmlPrintView = htmlViewUrl ? getPreferredPrintView() === 'html' : false;

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

    useEffect(() => {
        return () => {
            if (closeFallbackTimerRef.current !== null) {
                window.clearTimeout(closeFallbackTimerRef.current);
            }
        };
    }, []);

    const closeTabOrFallback = useCallback(() => {
        window.close();
        if (closeFallbackTimerRef.current !== null) {
            window.clearTimeout(closeFallbackTimerRef.current);
        }
        closeFallbackTimerRef.current = window.setTimeout(() => {
            if (!window.closed) {
                router.push(backFallbackPath);
            }
        }, 120);
    }, [backFallbackPath, router]);

    const handleBack = useCallback(() => {
        const hasOpener = (() => {
            try {
                return !!window.opener && !window.opener.closed;
            } catch {
                return false;
            }
        })();

        if (hasOpener) {
            try {
                window.opener?.focus();
            } catch {
                // opener のフォーカス権限がない場合は無視して閉じる処理を続行
            }
            closeTabOrFallback();
            return;
        }

        if (window.history.length <= 1) {
            closeTabOrFallback();
            return;
        }

        router.back();
    }, [closeTabOrFallback, router]);

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
