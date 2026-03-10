export const INTERNAL_API_SECRET_HEADER_NAME = 'x-internal-api-secret';

function extractBearerToken(authHeader: string | null | undefined): string | null {
    if (!authHeader) {
        return null;
    }

    const normalized = authHeader.trim();
    if (!normalized.startsWith('Bearer ')) {
        return null;
    }

    const token = normalized.slice('Bearer '.length).trim();
    return token || null;
}

export function extractInternalApiSecret(
    secretHeader: string | null | undefined,
    authHeader: string | null | undefined,
): string | null {
    const normalizedSecret = secretHeader?.trim();
    if (normalizedSecret) {
        return normalizedSecret;
    }

    return extractBearerToken(authHeader);
}

export function hasValidInternalApiSecret(
    secretHeader: string | null | undefined,
    authHeader: string | null | undefined,
    expectedSecret: string | null | undefined,
): boolean {
    if (!expectedSecret) {
        return false;
    }

    const providedSecret = extractInternalApiSecret(secretHeader, authHeader);
    return providedSecret === expectedSecret;
}
