'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';

import { appendCacheBust } from '@/components/print/cache-bust';
import { Button } from '@/components/ui/button';
import { usePrintNavigation } from '@/hooks/use-print-navigation';
import { getPreferredPrintView, type PrintView } from '@/lib/print-view';

type PdfPreviewClientProps = {
    pdfUrl: string;
    assistViewUrl?: string;
    backFallbackPath: string;
    serverPreferredPrintView?: PrintView | 'auto';
};

const RESTORE_RELOAD_THROTTLE_MS = 250;

export function PdfPreviewClient({
    pdfUrl,
    assistViewUrl,
    backFallbackPath,
    serverPreferredPrintView,
}: PdfPreviewClientProps) {
    return (
        <PdfPreviewClientInner
            key={pdfUrl}
            pdfUrl={pdfUrl}
            assistViewUrl={assistViewUrl}
            backFallbackPath={backFallbackPath}
            serverPreferredPrintView={serverPreferredPrintView}
        />
    );
}

function PdfPreviewClientInner({
    pdfUrl,
    assistViewUrl,
    backFallbackPath,
    serverPreferredPrintView = 'pdf',
}: PdfPreviewClientProps) {
    const t = useTranslations('PdfPreview');
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const hasLoadedFrameRef = useRef(false);
    const lastReloadAtRef = useRef(0);
    const [frameUrl, setFrameUrl] = useState(pdfUrl);
    const [isFrameLoaded, setIsFrameLoaded] = useState(false);
    const [clientPreferredPrintView, setClientPreferredPrintView] = useState<PrintView | null>(null);
    const isResolvingPreferredPrintView =
        serverPreferredPrintView === 'auto' && clientPreferredPrintView === null;
    const resolvedPreferredPrintView =
        serverPreferredPrintView === 'auto' ? clientPreferredPrintView : serverPreferredPrintView;
    const prefersAssistView = resolvedPreferredPrintView === 'assist' && Boolean(assistViewUrl);
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
        if (serverPreferredPrintView !== 'auto' || typeof window.requestAnimationFrame !== 'function') {
            return;
        }

        const animationFrameId = window.requestAnimationFrame(() => {
            setClientPreferredPrintView(getPreferredPrintView());
        });

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [serverPreferredPrintView]);

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

    if (isResolvingPreferredPrintView) {
        return (
            <div className="min-h-screen bg-muted px-4 py-4 md:px-6 md:py-6">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
                    <div className="rounded-md bg-white p-5">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('resolvingPrintMethod')}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (prefersAssistView && assistViewUrl) {
        return (
            <div className="min-h-screen bg-muted px-4 py-4 md:px-6 md:py-6">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
                    <div className="rounded-md bg-white p-5">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={handleBack}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    {t('back')}
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <h1 className="text-lg font-semibold">{t('assistTitle')}</h1>
                                <p className="text-sm text-muted-foreground">
                                    {t('assistDescription')}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button asChild>
                                    <a href={assistViewUrl}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        {t('openAssist')}
                                    </a>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <a href={frameUrl}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        {t('openPdf')}
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
        <div className="min-h-screen bg-muted px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={handleBack}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {t('back')}
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
                            {t('print')}
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {!isFrameLoaded && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isFrameLoaded
                            ? t('previewReady')
                            : t('loadingPdf')}
                    </div>

                    <Button
                        variant="ghost"
                        asChild
                    >
                        <a href={frameUrl} target="_blank" rel="noopener noreferrer">
                            {t('openPdfInNewTab')}
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>

                <div className="rounded-md border bg-white">
                    <iframe
                        ref={iframeRef}
                        title={t('previewTitle')}
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
