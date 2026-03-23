export type PrintView = 'assist' | 'html' | 'pdf';

type PrintViewEnvironment = {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    coarsePointer?: boolean;
};

export function sanitizePrintView(raw?: string | null): PrintView {
    if (raw === 'assist') return 'assist';
    return raw === 'html' ? 'html' : 'pdf';
}

export function detectPreferredPrintViewFromEnvironment(environment: PrintViewEnvironment): PrintView {
    const signals = detectPrintEnvironmentSignals(environment);

    if (signals.isIOSLike) return 'assist';
    return signals.prefersTouchPrintPage ? 'html' : 'pdf';
}

export function getPreferredPrintView(): PrintView {
    return detectPreferredPrintViewFromEnvironment(getBrowserPrintViewEnvironment());
}

function detectPrintEnvironmentSignals(environment: PrintViewEnvironment): {
    isIOSLike: boolean;
    prefersTouchPrintPage: boolean;
} {
    const userAgent = environment.userAgent ?? '';
    const platform = environment.platform ?? '';
    const maxTouchPoints = environment.maxTouchPoints ?? 0;
    const coarsePointer = environment.coarsePointer ?? false;

    const isIPhone = /iPhone/i.test(userAgent);
    const isIPad = /iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    // Android に加えて、iPhone/iPad 以外で Mobile を含む UA も HTML 印刷へ寄せる。
    const isMobileDevice = /Android/i.test(userAgent) || /Mobile/i.test(userAgent);

    return {
        isIOSLike: isIPhone || isIPad,
        prefersTouchPrintPage: isIPhone || isIPad || isMobileDevice || coarsePointer,
    };
}

function getBrowserPrintViewEnvironment(): PrintViewEnvironment {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {};
    }

    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        coarsePointer: typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false,
    };
}
