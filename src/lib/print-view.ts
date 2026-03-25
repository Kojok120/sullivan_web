export type PrintView = 'assist' | 'pdf';

type PrintViewEnvironment = {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    coarsePointer?: boolean;
};

export function sanitizePrintView(raw?: string | null): PrintView {
    if (raw === 'assist') return 'assist';
    return 'pdf';
}

export function detectPreferredPrintViewFromEnvironment(environment: PrintViewEnvironment): PrintView {
    const signals = detectPrintEnvironmentSignals(environment);

    return signals.prefersAssistView ? 'assist' : 'pdf';
}

export function getPreferredPrintView(): PrintView {
    return detectPreferredPrintViewFromEnvironment(getBrowserPrintViewEnvironment());
}

function detectPrintEnvironmentSignals(environment: PrintViewEnvironment): {
    prefersAssistView: boolean;
} {
    const userAgent = environment.userAgent ?? '';
    const platform = environment.platform ?? '';
    const maxTouchPoints = environment.maxTouchPoints ?? 0;
    const coarsePointer = environment.coarsePointer ?? false;

    const isIPhone = /iPhone/i.test(userAgent);
    const isIPad = /iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    // iPhone/iPad に加えて、Android や非 iOS のタッチ端末は印刷アシストへ寄せる。
    const isNonIosMobileDevice = !isIPhone && !isIPad && (/Android/i.test(userAgent) || /Mobile/i.test(userAgent));

    return {
        prefersAssistView: isIPhone || isIPad || isNonIosMobileDevice || coarsePointer,
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
