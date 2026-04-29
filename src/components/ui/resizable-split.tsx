'use client';

import {
    useCallback,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

interface ResizableSplitProps {
    left: ReactNode;
    right: ReactNode;
    storageKey?: string;
    defaultLeftPercent?: number;
    minLeftPercent?: number;
    maxLeftPercent?: number;
    className?: string;
}

const STORAGE_EVENT_PREFIX = 'resizable-split:change:';

function clampPercent(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function readStoredPercent(storageKey: string | undefined): number | null {
    if (!storageKey || typeof window === 'undefined') {
        return null;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
        return null;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
}

function subscribeToStorage(storageKey: string | undefined) {
    return (callback: () => void) => {
        if (!storageKey || typeof window === 'undefined') {
            return () => {};
        }
        const eventName = `${STORAGE_EVENT_PREFIX}${storageKey}`;
        const onStorage = (event: StorageEvent) => {
            if (event.key === storageKey) {
                callback();
            }
        };
        const onLocal = () => callback();
        window.addEventListener('storage', onStorage);
        window.addEventListener(eventName, onLocal);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(eventName, onLocal);
        };
    };
}

function writeStoredPercent(storageKey: string, value: number) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(storageKey, value.toFixed(2));
    window.dispatchEvent(new Event(`${STORAGE_EVENT_PREFIX}${storageKey}`));
}

export function ResizableSplit({
    left,
    right,
    storageKey,
    defaultLeftPercent = 25,
    minLeftPercent = 15,
    maxLeftPercent = 60,
    className,
}: ResizableSplitProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const subscribe = useMemo(() => subscribeToStorage(storageKey), [storageKey]);
    const getSnapshot = useCallback(() => readStoredPercent(storageKey), [storageKey]);
    const getServerSnapshot = useCallback(() => null, []);
    const storedPercent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const [transientPercent, setTransientPercent] = useState<number | null>(null);

    const leftPercent = clampPercent(
        transientPercent ?? storedPercent ?? defaultLeftPercent,
        minLeftPercent,
        maxLeftPercent,
    );

    const commitPercent = useCallback((next: number) => {
        const clamped = clampPercent(next, minLeftPercent, maxLeftPercent);
        if (storageKey) {
            writeStoredPercent(storageKey, clamped);
            setTransientPercent(null);
        } else {
            setTransientPercent(clamped);
        }
    }, [maxLeftPercent, minLeftPercent, storageKey]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const container = containerRef.current;
            if (!container) {
                return;
            }
            const rect = container.getBoundingClientRect();
            if (rect.width === 0) {
                return;
            }
            const next = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            setTransientPercent(clampPercent(next, minLeftPercent, maxLeftPercent));
        };

        const handlePointerUp = () => {
            try {
                target.releasePointerCapture(event.pointerId);
            } catch {
                // ポインタが既に解放済みの場合があるため握りつぶす
            }
            target.removeEventListener('pointermove', handlePointerMove);
            target.removeEventListener('pointerup', handlePointerUp);
            target.removeEventListener('pointercancel', handlePointerUp);
            setTransientPercent((current) => {
                if (current === null) {
                    return null;
                }
                if (storageKey) {
                    writeStoredPercent(storageKey, current);
                    return null;
                }
                return current;
            });
        };

        target.addEventListener('pointermove', handlePointerMove);
        target.addEventListener('pointerup', handlePointerUp);
        target.addEventListener('pointercancel', handlePointerUp);
    }, [maxLeftPercent, minLeftPercent, storageKey]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            commitPercent(leftPercent - 1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            commitPercent(leftPercent + 1);
        }
    }, [commitPercent, leftPercent]);

    return (
        <div
            ref={containerRef}
            className={cn('flex h-full overflow-hidden', className)}
        >
            <div className="min-w-0 overflow-hidden" style={{ width: `${leftPercent}%` }}>
                {left}
            </div>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={Math.round(leftPercent)}
                aria-valuemin={minLeftPercent}
                aria-valuemax={maxLeftPercent}
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onKeyDown={handleKeyDown}
                className="relative mx-1 w-1 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary/50 active:bg-primary/70"
            />
            <div className="min-w-0 flex-1 overflow-hidden">{right}</div>
        </div>
    );
}
