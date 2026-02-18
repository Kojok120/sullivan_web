import crypto from 'node:crypto';

type GeminiLiveTokenPayload = {
    sub: string;
    iat: number;
    exp: number;
    jti: string;
};

type VerifiedGeminiLiveToken = {
    valid: boolean;
    userId?: string;
    reason?: string;
};

const DEFAULT_TOKEN_TTL_SECONDS = 5 * 60;
const MAX_TOKEN_TTL_SECONDS = 30 * 60;

function resolveTokenSecret() {
    return process.env.GEMINI_LIVE_SESSION_SECRET || process.env.INTERNAL_API_SECRET || '';
}

function resolveTokenTtlSeconds() {
    const raw = Number.parseInt(process.env.GEMINI_LIVE_TOKEN_TTL_SECONDS || '', 10);
    if (!Number.isFinite(raw)) return DEFAULT_TOKEN_TTL_SECONDS;
    return Math.min(MAX_TOKEN_TTL_SECONDS, Math.max(60, raw));
}

function encodeBase64Url(value: string) {
    return Buffer.from(value, 'utf-8').toString('base64url');
}

function decodeBase64Url(value: string) {
    return Buffer.from(value, 'base64url').toString('utf-8');
}

function signPayload(encodedPayload: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function timingSafeEquals(a: string, b: string) {
    // 可変長文字列をそのまま比較せず、固定長ダイジェスト同士を比較する
    const left = crypto.createHash('sha256').update(a).digest();
    const right = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(left, right);
}

export function issueGeminiLiveSessionToken(userId: string) {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
        throw new Error('User ID is required to issue Gemini Live token');
    }

    const secret = resolveTokenSecret();
    if (!secret) {
        throw new Error('GEMINI_LIVE_SESSION_SECRET is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = resolveTokenTtlSeconds();
    const payload: GeminiLiveTokenPayload = {
        sub: trimmedUserId,
        iat: now,
        exp: now + ttl,
        jti: crypto.randomUUID(),
    };

    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = signPayload(encodedPayload, secret);

    return {
        token: `${encodedPayload}.${signature}`,
        expiresAt: payload.exp,
        ttlSeconds: ttl,
    };
}

export function verifyGeminiLiveSessionToken(token: string): VerifiedGeminiLiveToken {
    const secret = resolveTokenSecret();
    if (!secret) {
        return { valid: false, reason: 'missing_secret' };
    }

    if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'missing_token' };
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
        return { valid: false, reason: 'invalid_format' };
    }

    const expectedSignature = signPayload(encodedPayload, secret);
    if (!timingSafeEquals(signature, expectedSignature)) {
        return { valid: false, reason: 'invalid_signature' };
    }

    try {
        const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as GeminiLiveTokenPayload;
        if (!parsed || typeof parsed !== 'object') {
            return { valid: false, reason: 'invalid_payload' };
        }

        if (typeof parsed.sub !== 'string' || !parsed.sub.trim()) {
            return { valid: false, reason: 'invalid_subject' };
        }

        if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) {
            return { valid: false, reason: 'invalid_expiration' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (parsed.exp <= now) {
            return { valid: false, reason: 'token_expired' };
        }

        return {
            valid: true,
            userId: parsed.sub.trim(),
        };
    } catch {
        return { valid: false, reason: 'payload_parse_error' };
    }
}
