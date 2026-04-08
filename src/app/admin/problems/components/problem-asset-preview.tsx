'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    DEFAULT_PROBLEM_FIGURE_DISPLAY,
    PROBLEM_FIGURE_DEFAULT_ZOOM,
    getProblemFigureShiftPercent,
    normalizeProblemFigureDisplay,
    PROBLEM_FIGURE_MAX_ZOOM,
    PROBLEM_FIGURE_MIN_ZOOM,
    resolveProblemFigureAspectRatio,
} from '@/lib/problem-figure-display';
import { ensureRenderableSvgMarkup, normalizeSvgExport } from '@/lib/problem-svg';
import type { ProblemFigureDisplay } from '@/lib/structured-problem';

export type ProblemAssetPreviewItem = {
    id: string;
    kind: string;
    fileName: string;
    mimeType?: string | null;
    signedUrl?: string | null;
    inlineContent?: string | null;
    width?: number | null;
    height?: number | null;
};

type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    display: ProblemFigureDisplay;
};

function isSvgAsset(asset: ProblemAssetPreviewItem) {
    return asset.kind === 'SVG'
        || asset.mimeType === 'image/svg+xml'
        || normalizeSvgExport(asset.inlineContent ?? '').startsWith('<svg');
}

function findPreviewAsset(assets: ProblemAssetPreviewItem[], assetId?: string | null) {
    if (assetId) {
        const exact = assets.find((asset) => asset.id === assetId);
        if (exact) {
            return exact;
        }
    }

    return assets.find((asset) => isSvgAsset(asset))
        ?? assets.find((asset) => asset.kind === 'IMAGE' || asset.mimeType?.startsWith('image/') || Boolean(asset.signedUrl));
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function ProblemAssetPreview({
    assetId,
    assets,
    caption,
    emptyMessage = '図版がまだ設定されていません。',
    displayScale = 1,
    display,
    editable = false,
    onDisplayChange,
}: {
    assetId?: string | null;
    assets: ProblemAssetPreviewItem[];
    caption?: string;
    emptyMessage?: string;
    displayScale?: number;
    display?: ProblemFigureDisplay | null;
    editable?: boolean;
    onDisplayChange?: (next: ProblemFigureDisplay) => void;
}) {
    const asset = findPreviewAsset(assets, assetId);
    const zoomInputId = useId();
    const frameRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const [measuredAspectRatio, setMeasuredAspectRatio] = useState<number | null>(null);
    const normalizedDisplay = normalizeProblemFigureDisplay(display);
    const isEditable = editable && Boolean(onDisplayChange);
    const shiftPercent = getProblemFigureShiftPercent(normalizedDisplay);

    useEffect(() => {
        setMeasuredAspectRatio(null);
    }, [asset?.id]);

    if (!asset) {
        return (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    const aspectRatio = measuredAspectRatio ?? resolveProblemFigureAspectRatio(asset);
    const svgMarkup = isSvgAsset(asset)
        ? ensureRenderableSvgMarkup(asset.inlineContent ?? '')
        : '';
    const frameWidth = `${Math.max(1, displayScale * 100)}%`;
    const frameWrapperMaxWidth = editable
        ? `${displayScale < 1 ? 640 : 720}px`
        : undefined;

    const emitDisplayChange = (next: Partial<ProblemFigureDisplay>) => {
        if (!onDisplayChange) {
            return;
        }

        onDisplayChange(normalizeProblemFigureDisplay({
            ...normalizedDisplay,
            ...next,
        }));
    };

    const finishDrag = (pointerId?: number) => {
        if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) {
            return;
        }

        dragStateRef.current = null;
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!isEditable) {
            return;
        }

        if (event.pointerType !== 'touch' && event.button !== 0) {
            return;
        }

        const rect = frameRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return;
        }

        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            width: rect.width,
            height: rect.height,
            display: normalizedDisplay,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId || !onDisplayChange) {
            return;
        }

        const maxShiftX = Math.abs(dragState.display.zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) * dragState.width / 2;
        const maxShiftY = Math.abs(dragState.display.zoom - PROBLEM_FIGURE_DEFAULT_ZOOM) * dragState.height / 2;
        const nextPanX = maxShiftX > 0
            ? clamp(((dragState.display.panX * maxShiftX) + (event.clientX - dragState.startX)) / maxShiftX, -1, 1)
            : 0;
        const nextPanY = maxShiftY > 0
            ? clamp(((dragState.display.panY * maxShiftY) + (event.clientY - dragState.startY)) / maxShiftY, -1, 1)
            : 0;

        onDisplayChange(normalizeProblemFigureDisplay({
            ...dragState.display,
            panX: nextPanX,
            panY: nextPanY,
        }));
    };

    const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextZoom = Number.parseFloat(event.currentTarget.value);
        if (!Number.isFinite(nextZoom)) {
            return;
        }

        emitDisplayChange({
            zoom: nextZoom,
            panX: Math.abs(nextZoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 ? normalizedDisplay.panX : 0,
            panY: Math.abs(nextZoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 ? normalizedDisplay.panY : 0,
        });
    };

    const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
        if (!isEditable || !onDisplayChange) {
            return;
        }

        event.preventDefault();
        const nextZoom = Number(clamp(
            normalizedDisplay.zoom - (event.deltaY * 0.001),
            PROBLEM_FIGURE_MIN_ZOOM,
            PROBLEM_FIGURE_MAX_ZOOM,
        ).toFixed(4));

        onDisplayChange(normalizeProblemFigureDisplay({
            ...normalizedDisplay,
            zoom: nextZoom,
            panX: Math.abs(nextZoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 ? normalizedDisplay.panX : 0,
            panY: Math.abs(nextZoom - PROBLEM_FIGURE_DEFAULT_ZOOM) > 0.0001 ? normalizedDisplay.panY : 0,
        }));
    };

    return (
        <figure className="space-y-3 rounded-lg border bg-white p-4">
            <div className="flex justify-center" style={frameWrapperMaxWidth ? { maxWidth: frameWrapperMaxWidth, marginInline: 'auto', width: '100%' } : undefined}>
                <div
                    ref={frameRef}
                    aria-label={isEditable ? '図版の位置調整エリア' : undefined}
                    data-testid={isEditable ? 'problem-asset-crop-frame' : undefined}
                    className={`relative overflow-hidden rounded-md border bg-slate-50 ${isEditable ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
                    style={{
                        width: frameWidth,
                        maxWidth: '100%',
                        aspectRatio: `${aspectRatio}`,
                    }}
                    onPointerCancel={(event) => finishDrag(event.pointerId)}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(event) => finishDrag(event.pointerId)}
                    onWheel={handleWheel}
                >
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                            transform: `translate(${shiftPercent.x}%, ${shiftPercent.y}%)`,
                        }}
                    >
                        <div
                            className="h-full w-full"
                            style={{
                                transform: `scale(${normalizedDisplay.zoom})`,
                                transformOrigin: 'center',
                            }}
                        >
                            {svgMarkup ? (
                                <div
                                    className="h-full w-full select-none pointer-events-none [&_svg]:h-full [&_svg]:w-full [&_svg]:max-w-none"
                                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                                />
                            ) : asset.signedUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={asset.signedUrl}
                                    alt={caption || asset.fileName}
                                    className="h-full w-full object-contain select-none pointer-events-none"
                                    draggable={false}
                                    onLoad={(event) => {
                                        const { naturalWidth, naturalHeight } = event.currentTarget;
                                        if (naturalWidth > 0 && naturalHeight > 0) {
                                            setMeasuredAspectRatio(naturalWidth / naturalHeight);
                                        }
                                    }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {isEditable ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={zoomInputId}>拡大率</Label>
                        <span className="text-xs text-muted-foreground">{normalizedDisplay.zoom.toFixed(2)}x</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            id={zoomInputId}
                            aria-label="拡大率"
                            className="h-2 w-full accent-foreground"
                            max={PROBLEM_FIGURE_MAX_ZOOM}
                            min={PROBLEM_FIGURE_MIN_ZOOM}
                            step="0.01"
                            type="range"
                            value={normalizedDisplay.zoom}
                            onChange={handleZoomChange}
                        />
                        <Button type="button" size="sm" variant="outline" onClick={() => onDisplayChange?.(DEFAULT_PROBLEM_FIGURE_DISPLAY)}>
                            リセット
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        図をドラッグして位置を調整できます。ホイールでも拡大・縮小できます。
                    </p>
                </div>
            ) : null}

            {caption ? <figcaption className="text-sm text-muted-foreground">{caption}</figcaption> : null}
        </figure>
    );
}
