'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { usePrintNavigation } from '@/hooks/use-print-navigation';

type PrintAssistClientProps = {
    backFallbackPath: string;
    htmlViewUrl: string;
    pdfUrl: string;
};

type PreparedPdfFile = {
    file: File;
    sourceUrl: string;
};

const DEFAULT_PDF_FILENAME = 'sullivan-print.pdf';

export function PrintAssistClient({ backFallbackPath, htmlViewUrl, pdfUrl }: PrintAssistClientProps) {
    const { handleBack } = usePrintNavigation(backFallbackPath);
    const [preparedFile, setPreparedFile] = useState<PreparedPdfFile | null>(null);
    const [isPreparing, setIsPreparing] = useState(true);
    const lastPrepareControllerRef = useRef<AbortController | null>(null);

    const preparePdf = useCallback(async (signal?: AbortSignal) => {
        setIsPreparing(true);
        setPreparedFile(null);

        try {
            const response = await fetch(pdfUrl, {
                cache: 'no-store',
                signal,
            });

            if (!response.ok) {
                throw new Error(`PDF fetch failed: ${response.status}`);
            }

            const blob = await response.blob();
            const filename = parseContentDispositionFilename(response.headers.get('Content-Disposition'))
                ?? DEFAULT_PDF_FILENAME;
            const file = new File([blob], filename, {
                type: blob.type || 'application/pdf',
            });

            if (!signal?.aborted) {
                setPreparedFile({
                    file,
                    sourceUrl: pdfUrl,
                });
            }

            return file;
        } catch (error) {
            if (isAbortError(error)) {
                return null;
            }

            if (!signal?.aborted) {
                setPreparedFile(null);
            }

            return null;
        } finally {
            if (!signal?.aborted) {
                setIsPreparing(false);
            }
        }
    }, [pdfUrl]);

    const runPreparePdf = useCallback(async () => {
        lastPrepareControllerRef.current?.abort();
        const controller = new AbortController();
        lastPrepareControllerRef.current = controller;

        try {
            return await preparePdf(controller.signal);
        } finally {
            if (lastPrepareControllerRef.current === controller) {
                lastPrepareControllerRef.current = null;
            }
        }
    }, [preparePdf]);

    useEffect(() => {
        void runPreparePdf();

        return () => {
            lastPrepareControllerRef.current?.abort();
            lastPrepareControllerRef.current = null;
        };
    }, [runPreparePdf]);

    const handleShare = useCallback(async () => {
        if (isPreparing) return;

        const file = preparedFile?.sourceUrl === pdfUrl
            ? preparedFile.file
            : await runPreparePdf();
        if (!file) {
            toast.error('PDFの準備に失敗しました。');
            return;
        }

        if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
            toast.error('この端末では共有メニューを開けません。HTML印刷をお試しください。');
            return;
        }

        let canShareFiles = false;
        try {
            canShareFiles = navigator.canShare({ files: [file] });
        } catch {
            canShareFiles = false;
        }

        if (!canShareFiles) {
            toast.error('この端末では共有メニューを開けません。HTML印刷をお試しください。');
            return;
        }

        try {
            await navigator.share({
                files: [file],
                title: file.name,
            });
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }

            toast.error('共有メニューを開けませんでした。');
        }
    }, [isPreparing, pdfUrl, preparedFile, runPreparePdf]);

    return (
        <div className="min-h-screen bg-gray-100 px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[720px] items-center justify-center">
                <div className="w-full rounded-xl bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center justify-between gap-3">
                            <Button variant="outline" onClick={handleBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                戻る
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-xl font-semibold">このプリントを印刷</h1>
                            <p className="text-sm text-muted-foreground">
                                ボタンを押すと共有メニューが開きます。「プリント」を選んでください。
                            </p>
                            <p className="text-sm text-muted-foreground">
                                共有メニューが使えない場合は、下の「HTML印刷を開く」をお試しください。
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                type="button"
                                className="sm:flex-1"
                                onClick={() => {
                                    void handleShare();
                                }}
                                disabled={isPreparing}
                            >
                                {isPreparing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        印刷メニューを準備中...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="mr-2 h-4 w-4" />
                                        印刷メニューを開く
                                    </>
                                )}
                            </Button>

                            <Button variant="outline" asChild className="sm:flex-1">
                                <a href={pdfUrl}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    PDFを開く
                                </a>
                            </Button>

                            <Button variant="outline" asChild className="sm:flex-1">
                                <a href={htmlViewUrl}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    HTML印刷を開く
                                </a>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function parseContentDispositionFilename(headerValue: string | null): string | undefined {
    if (!headerValue) return undefined;

    const encodedMatch = headerValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch {
            // エンコードが壊れている場合は通常の filename にフォールバックする。
        }
    }

    const simpleMatch = headerValue.match(/filename\s*=\s*"([^"]+)"/i)
        ?? headerValue.match(/filename\s*=\s*([^;]+)/i);
    return simpleMatch?.[1]?.trim();
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}
