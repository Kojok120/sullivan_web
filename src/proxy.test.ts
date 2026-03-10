import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { updateSessionMock } = vi.hoisted(() => ({
    updateSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase/middleware', () => ({
    updateSession: updateSessionMock,
}));

import { proxy } from '@/proxy';

describe('proxy', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        updateSessionMock.mockReset();
    });

    it('未ログインの /login はそのまま通す', async () => {
        const request = new NextRequest('http://localhost/login');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: null,
        });

        const result = await proxy(request);

        expect(result).toBe(supabaseResponse);
        expect(result.status).toBe(200);
        expect(result.headers.get('location')).toBeNull();
    });

    it('未ログインの保護ページは /login に redirect する', async () => {
        const request = new NextRequest('http://localhost/unit-focus');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: null,
        });

        const result = await proxy(request);

        expect(result.status).toBe(307);
        expect(result.headers.get('location')).toBe('http://localhost/login');
    });
});
