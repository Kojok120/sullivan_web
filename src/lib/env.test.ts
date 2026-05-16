import { describe, expect, it } from 'vitest';

import { parseProductEnv } from '@/lib/env';

describe('env schema', () => {
    it('必須の接続情報とプロダクト既定値を検証する', () => {
        const env = parseProductEnv({
            DATABASE_URL: 'postgresql://example',
            NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        });

        expect(env.PRODUCT_ID).toBe('sullivan-jp');
        expect(env.CONTENT_PACK_ID).toBe('jp-juken');
        expect(env.LOCALE).toBe('ja-JP');
    });

    it('不正な product id は拒否する', () => {
        expect(() => parseProductEnv({
            DATABASE_URL: 'postgresql://example',
            NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
            PRODUCT_ID: 'unknown-product',
        })).toThrow();
    });
});
