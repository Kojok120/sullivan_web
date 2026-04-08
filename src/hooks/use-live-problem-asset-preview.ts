import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

export type LiveProblemAssetPreviewItem = {
    id: string;
    kind: 'SVG';
    fileName: string;
    mimeType: 'image/svg+xml';
    inlineContent: string;
};

export type LiveProblemAssetPreview = {
    cardId: string;
    asset: LiveProblemAssetPreviewItem;
};

type SyncProblemAssetPreviewPayload = {
    svgContent?: string;
};

type UseLiveProblemAssetPreviewOptions = {
    authoringStateText: string;
    cardId: string | null;
    enabled: boolean;
    syncHandlerRef: MutableRefObject<(() => Promise<SyncProblemAssetPreviewPayload>) | null>;
};

const LIVE_PREVIEW_DEBOUNCE_MS = 250;

export function useLiveProblemAssetPreview({
    authoringStateText,
    cardId,
    enabled,
    syncHandlerRef,
}: UseLiveProblemAssetPreviewOptions) {
    const [preview, setPreview] = useState<LiveProblemAssetPreview | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (!cardId) {
            setPreview(null);
            return;
        }

        setPreview((current) => current?.cardId === cardId ? current : null);

        if (!enabled) {
            return;
        }

        let cancelled = false;
        const timeoutId = window.setTimeout(async () => {
            const syncHandler = syncHandlerRef.current;
            if (!syncHandler) {
                return;
            }

            try {
                const payload = await syncHandler();
                const svgContent = payload.svgContent?.trim();

                if (cancelled || requestIdRef.current !== requestId || !svgContent) {
                    return;
                }

                setPreview({
                    cardId,
                    asset: {
                        id: `live-preview-${cardId}`,
                        kind: 'SVG',
                        fileName: `live-preview-${cardId}.svg`,
                        mimeType: 'image/svg+xml',
                        inlineContent: svgContent,
                    },
                });
            } catch (error) {
                console.error('[use-live-problem-asset-preview] SVG 同期に失敗しました', error);
            }
        }, LIVE_PREVIEW_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [authoringStateText, cardId, enabled, syncHandlerRef]);

    return preview;
}
