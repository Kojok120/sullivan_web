'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function usePrintNavigation(backFallbackPath: string) {
    const router = useRouter();
    const closeFallbackTimerRef = useRef<number | null>(null);

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
                // opener のフォーカス権限がない場合は無視して閉じる処理を続行する
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

    return { handleBack };
}
