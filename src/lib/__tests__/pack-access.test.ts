import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@sullivan/user-platform/auth';
import {
    PackAccessError,
    assertPackAccess,
    hasPackAccess,
    resolvePackId,
} from '@sullivan/user-platform/pack-access';

function buildSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
    return {
        userId: 'user-1',
        role: 'STUDENT',
        name: 'テスト',
        defaultPackId: 'jp-juken',
        allowedPackIds: ['jp-juken'],
        ...overrides,
    };
}

describe('hasPackAccess', () => {
    it('session が null の場合は false', () => {
        expect(hasPackAccess(null, 'jp-juken')).toBe(false);
    });

    it('allowedPackIds に含まれていれば true', () => {
        const session = buildSession({ allowedPackIds: ['jp-juken', 'jp-language'] });
        expect(hasPackAccess(session, 'jp-juken')).toBe(true);
        expect(hasPackAccess(session, 'jp-language')).toBe(true);
    });

    it('allowedPackIds に含まれていなければ false', () => {
        const session = buildSession({ allowedPackIds: ['jp-juken'] });
        expect(hasPackAccess(session, 'bd-secondary')).toBe(false);
    });
});

describe('assertPackAccess', () => {
    it('アクセス権がある場合は何も throw しない', () => {
        const session = buildSession();
        expect(() => assertPackAccess(session, 'jp-juken')).not.toThrow();
    });

    it('アクセス権が無い場合は PackAccessError を throw する', () => {
        const session = buildSession();
        expect(() => assertPackAccess(session, 'bd-secondary')).toThrow(PackAccessError);
    });

    it('session が null の場合は PackAccessError を throw する', () => {
        expect(() => assertPackAccess(null, 'jp-juken')).toThrow(PackAccessError);
    });
});

describe('resolvePackId', () => {
    it('requestedPackId 未指定なら defaultPackId を返す', () => {
        const session = buildSession({ defaultPackId: 'jp-juken' });
        expect(resolvePackId(session)).toBe('jp-juken');
        expect(resolvePackId(session, null)).toBe('jp-juken');
    });

    it('requestedPackId 指定 + 許可済なら requestedPackId を返す', () => {
        const session = buildSession({
            allowedPackIds: ['jp-juken', 'jp-language'],
            defaultPackId: 'jp-juken',
        });
        expect(resolvePackId(session, 'jp-language')).toBe('jp-language');
    });

    it('requestedPackId 指定 + 未許可なら PackAccessError を throw', () => {
        const session = buildSession({ allowedPackIds: ['jp-juken'] });
        expect(() => resolvePackId(session, 'bd-secondary')).toThrow(PackAccessError);
    });

    it('session が null なら PackAccessError を throw', () => {
        expect(() => resolvePackId(null)).toThrow(PackAccessError);
    });
});
