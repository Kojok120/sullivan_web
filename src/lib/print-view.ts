export type PrintView = 'html' | 'pdf';

type PrintViewEnvironment = {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    coarsePointer?: boolean;
};

export function sanitizePrintView(raw?: string | null): PrintView {
    return raw === 'html' ? 'html' : 'pdf';
}

export function detectPreferredPrintViewFromEnvironment(environment: PrintViewEnvironment): PrintView {
    const userAgent = environment.userAgent ?? '';
    const platform = environment.platform ?? '';
    const maxTouchPoints = environment.maxTouchPoints ?? 0;
    const coarsePointer = environment.coarsePointer ?? false;

    const isIPhone = /iPhone/i.test(userAgent);
    const isIPad = /iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    // Android に加えて、iPhone/iPad 以外で Mobile を含む UA も HTML 印刷へ寄せる。
    const isMobileDevice = /Android/i.test(userAgent) || /Mobile/i.test(userAgent);

    return isIPhone || isIPad || isMobileDevice || coarsePointer ? 'html' : 'pdf';
}

export function getPreferredPrintView(): PrintView {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return 'pdf';
    }

    return detectPreferredPrintViewFromEnvironment({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        coarsePointer: typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false,
    });
}
