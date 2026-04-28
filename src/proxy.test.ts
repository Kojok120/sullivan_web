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

    it('未ログインの /admin は /login に redirect する', async () => {
        const request = new NextRequest('http://localhost/admin');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: null,
        });

        const result = await proxy(request);

        expect(result.status).toBe(307);
        expect(result.headers.get('location')).toBe('http://localhost/login');
    });

    it('未ログインの /teacher は /login に redirect する', async () => {
        const request = new NextRequest('http://localhost/teacher');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: null,
        });

        const result = await proxy(request);

        expect(result.status).toBe(307);
        expect(result.headers.get('location')).toBe('http://localhost/login');
    });

    it('学生向け印刷ページには no-store ヘッダーを付与する', async () => {
        const request = new NextRequest('http://localhost/dashboard/print?subjectId=subject-1&sets=1');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: {
                app_metadata: { role: 'STUDENT' },
                user_metadata: {},
            },
        });

        const result = await proxy(request);

        expect(result).toBe(supabaseResponse);
        expect(result.status).toBe(200);
        expect(result.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
        expect(result.headers.get('Pragma')).toBe('no-cache');
        expect(result.headers.get('Expires')).toBe('0');
    });

    it('学生向け印刷ページの末尾スラッシュ付き URL にも no-store ヘッダーを付与する', async () => {
        const request = new NextRequest('http://localhost/dashboard/print/?subjectId=subject-1&sets=1');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: {
                app_metadata: { role: 'STUDENT' },
                user_metadata: {},
            },
        });

        const result = await proxy(request);

        expect(result).toBe(supabaseResponse);
        expect(result.status).toBe(200);
        expect(result.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
        expect(result.headers.get('Pragma')).toBe('no-cache');
        expect(result.headers.get('Expires')).toBe('0');
    });

    it('講師向け印刷ページへの redirect にも no-store ヘッダーを付与する', async () => {
        const request = new NextRequest('http://localhost/teacher/students/student-1/print?subjectId=subject-1&sets=1');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: null,
        });

        const result = await proxy(request);

        expect(result.status).toBe(307);
        expect(result.headers.get('location')).toBe('http://localhost/login');
        expect(result.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
        expect(result.headers.get('Pragma')).toBe('no-cache');
        expect(result.headers.get('Expires')).toBe('0');
    });

    it('認証済み講師の印刷ページにも no-store ヘッダーを付与する', async () => {
        const request = new NextRequest('http://localhost/teacher/students/student-1/print?subjectId=subject-1&sets=1');
        const supabaseResponse = NextResponse.next({ request });

        updateSessionMock.mockResolvedValue({
            supabaseResponse,
            user: {
                app_metadata: { role: 'TEACHER' },
                user_metadata: {},
            },
        });

        const result = await proxy(request);

        expect(result).toBe(supabaseResponse);
        expect(result.status).toBe(200);
        expect(result.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
        expect(result.headers.get('Pragma')).toBe('no-cache');
        expect(result.headers.get('Expires')).toBe('0');
    });
});
