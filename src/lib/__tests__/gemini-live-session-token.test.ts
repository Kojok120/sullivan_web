import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    issueGeminiLiveSessionToken,
    verifyGeminiLiveSessionToken,
} from '@/lib/gemini-live-session-token'

const SECRET_ENV_KEYS = [
    'GEMINI_LIVE_SESSION_SECRET',
    'INTERNAL_API_SECRET',
]

function clearSecretEnvs() {
    for (const key of SECRET_ENV_KEYS) {
        vi.stubEnv(key, '')
    }
}

describe('gemini-live-session-token', () => {
    beforeEach(() => {
        vi.useRealTimers()
        clearSecretEnvs()
        vi.stubEnv('GEMINI_LIVE_SESSION_SECRET', 'test-secret')
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllEnvs()
    })

    it('発行したトークンを検証できる', () => {
        const issued = issueGeminiLiveSessionToken('student-1')
        const verified = verifyGeminiLiveSessionToken(issued.token)

        expect(verified.valid).toBe(true)
        expect(verified.userId).toBe('student-1')
        expect(issued.ttlSeconds).toBeGreaterThan(0)
    })

    it('期限切れトークンを拒否する', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
        vi.stubEnv('GEMINI_LIVE_TOKEN_TTL_SECONDS', '60')

        const issued = issueGeminiLiveSessionToken('student-2')

        vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z'))
        const verified = verifyGeminiLiveSessionToken(issued.token)

        expect(verified.valid).toBe(false)
        expect(verified.reason).toBe('token_expired')
    })

    it('改ざんトークンを拒否する', () => {
        const issued = issueGeminiLiveSessionToken('student-3')
        const [payload, signature] = issued.token.split('.')
        const tamperedPayload = `${payload}x`

        const verified = verifyGeminiLiveSessionToken(`${tamperedPayload}.${signature}`)

        expect(verified.valid).toBe(false)
        expect(verified.reason).toBe('invalid_signature')
    })

    it('シークレット未設定時は発行に失敗する', () => {
        clearSecretEnvs()

        expect(() => issueGeminiLiveSessionToken('student-4')).toThrowError('GEMINI_LIVE_SESSION_SECRET is not configured')
    })

    it('INTERNAL_API_SECRETをフォールバックシークレットとして使用できる', () => {
        vi.stubEnv('GEMINI_LIVE_SESSION_SECRET', '')
        vi.stubEnv('INTERNAL_API_SECRET', 'fallback-secret')

        const issued = issueGeminiLiveSessionToken('student-5')
        const verified = verifyGeminiLiveSessionToken(issued.token)

        expect(verified.valid).toBe(true)
        expect(verified.userId).toBe('student-5')
    })
})
