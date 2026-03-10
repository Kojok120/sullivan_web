import { describe, expect, it } from 'vitest';

import { hasValidInternalApiSecret } from '@/lib/internal-api-auth';

describe('internal api auth', () => {
    it('Authorization ヘッダーの Bearer は大文字小文字を区別せず受け付ける', () => {
        expect(hasValidInternalApiSecret(null, 'bearer shared-secret', 'shared-secret')).toBe(true);
        expect(hasValidInternalApiSecret(null, 'BeArEr shared-secret', 'shared-secret')).toBe(true);
    });

    it('Bearer scheme 以外や空 token は拒否する', () => {
        expect(hasValidInternalApiSecret(null, 'Basic shared-secret', 'shared-secret')).toBe(false);
        expect(hasValidInternalApiSecret(null, 'bearer   ', 'shared-secret')).toBe(false);
    });
});
