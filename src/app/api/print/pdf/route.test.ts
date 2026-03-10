import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getCurrentUserMock,
    getPrintGateMock,
    getPrintDataMock,
    buildPrintPdfCacheKeyMock,
    buildProblemIdsHashMock,
    getOrCreatePrintPdfMock,
} = vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    getPrintGateMock: vi.fn(),
    getPrintDataMock: vi.fn(),
    buildPrintPdfCacheKeyMock: vi.fn(),
    buildProblemIdsHashMock: vi.fn(),
    getOrCreatePrintPdfMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    getCurrentUser: getCurrentUserMock,
}));

vi.mock('@/lib/print-gate-service', () => ({
    getPrintGate: getPrintGateMock,
}));

vi.mock('@/lib/print-service', () => ({
    getPrintData: getPrintDataMock,
}));

vi.mock('@/lib/print-pdf/render-service', () => ({
    buildPrintPdfCacheKey: buildPrintPdfCacheKeyMock,
    buildProblemIdsHash: buildProblemIdsHashMock,
    getOrCreatePrintPdf: getOrCreatePrintPdfMock,
}));

import { GET } from '@/app/api/print/pdf/route';

function createRequest(search = 'subjectId=subject-1&sets=1&cb=initial', headers?: HeadersInit) {
    return new NextRequest(`http://localhost/api/print/pdf?${search}`, {
        headers,
    });
}

function expectNoStoreHeaders(response: Response) {
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, no-cache, max-age=0, must-revalidate');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.headers.get('Expires')).toBe('0');
}

describe('print pdf route', () => {
    beforeEach(() => {
        getCurrentUserMock.mockResolvedValue({
            userId: 'student-1',
            role: 'STUDENT',
            name: '生徒',
        });
        getPrintGateMock.mockResolvedValue({ blocked: false });
        getPrintDataMock.mockResolvedValue({
            studentName: '生徒',
            studentLoginId: 'S0007',
            subjectName: '英語',
            problems: [],
            problemSets: [],
            unitToken: undefined,
        });
        buildProblemIdsHashMock.mockReturnValue('problem-hash');
        buildPrintPdfCacheKeyMock.mockReturnValue('cache-key');
        getOrCreatePrintPdfMock.mockResolvedValue({
            buffer: Buffer.from('pdf'),
            etag: '"etag"',
            cacheStatus: 'rendered',
            renderMs: 12,
            pageCount: 1,
        });
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        getCurrentUserMock.mockReset();
        getPrintGateMock.mockReset();
        getPrintDataMock.mockReset();
        buildPrintPdfCacheKeyMock.mockReset();
        buildProblemIdsHashMock.mockReset();
        getOrCreatePrintPdfMock.mockReset();
    });

    it('200 応答でも no-store ヘッダーを返し、If-None-Match を無視する', async () => {
        const response = await GET(createRequest('subjectId=subject-1&sets=1&cb=initial', {
            'If-None-Match': '"etag"',
        }));

        expect(response.status).toBe(200);
        expectNoStoreHeaders(response);
        expect(response.headers.get('ETag')).toBeNull();
        expect(response.headers.get('Content-Type')).toBe('application/pdf');
        expect(getOrCreatePrintPdfMock).toHaveBeenCalledTimes(1);
    });

    it('401 応答でも no-store ヘッダーを返す', async () => {
        getCurrentUserMock.mockResolvedValue(null);

        const response = await GET(createRequest());

        expect(response.status).toBe(401);
        expectNoStoreHeaders(response);
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('403 応答でも no-store ヘッダーを返す', async () => {
        getPrintGateMock.mockResolvedValue({
            blocked: true,
            coreProblemId: 'cp-1',
            coreProblemName: '主語と動詞',
        });

        const response = await GET(createRequest());

        expect(response.status).toBe(403);
        expectNoStoreHeaders(response);
        await expect(response.json()).resolves.toEqual({
            error: 'print blocked by lecture gate',
            blocked: true,
            coreProblemId: 'cp-1',
            coreProblemName: '主語と動詞',
        });
    });

    it('404 応答でも no-store ヘッダーを返す', async () => {
        getPrintDataMock.mockResolvedValue(null);

        const response = await GET(createRequest());

        expect(response.status).toBe(404);
        expectNoStoreHeaders(response);
        await expect(response.json()).resolves.toEqual({ error: 'Print data not found' });
    });

    it('500 応答でも no-store ヘッダーを返す', async () => {
        getOrCreatePrintPdfMock.mockRejectedValue(new Error('render failed'));

        const response = await GET(createRequest());

        expect(response.status).toBe(500);
        expectNoStoreHeaders(response);
        await expect(response.json()).resolves.toEqual({ error: 'Failed to generate print PDF' });
    });
});
