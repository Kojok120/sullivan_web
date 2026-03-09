import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/internal/cloud-run/min-instances/route';
import { INTERNAL_API_SECRET_HEADER_NAME } from '@/lib/internal-api-auth';

function createRequest(
    body: unknown,
    options: {
        authHeader?: string;
        secretHeader?: string;
    } = {
        authHeader: 'Bearer test-secret',
    },
) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (options.authHeader) {
        headers.Authorization = options.authHeader;
    }

    if (options.secretHeader) {
        headers[INTERNAL_API_SECRET_HEADER_NAME] = options.secretHeader;
    }

    return new Request('http://localhost/api/internal/cloud-run/min-instances', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

describe('cloud-run min instances route', () => {
    beforeEach(() => {
        vi.stubEnv('INTERNAL_API_SECRET', 'test-secret');
        vi.stubEnv('GOOGLE_CLOUD_PROJECT_ID', 'sullivan-production-483212');
        vi.stubEnv('CLOUD_RUN_REGION', 'asia-northeast1');
        vi.stubEnv('K_SERVICE', 'sullivan-app-production');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('不正な Authorization ヘッダーを拒否する', async () => {
        const response = await POST(
            createRequest(
                { minInstances: 1, reason: 'weekday-warm-start' },
                { authHeader: 'Bearer wrong-secret' },
            ),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('不正な minInstances を拒否する', async () => {
        const response = await POST(
            createRequest({ minInstances: 2, reason: 'weekday-warm-start' }),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            success: false,
            error: 'Invalid request body',
        });
    });

    it('minInstances=1 で Cloud Run API を呼び出す', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'metadata-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                name: 'projects/example/locations/asia-northeast1/operations/test-op',
                scaling: { minInstanceCount: 1 },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', mockFetch);

        const response = await POST(
            createRequest({ minInstances: 1, reason: 'weekday-warm-start' }),
        );

        expect(response.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            {
                headers: {
                    'Metadata-Flavor': 'Google',
                },
            },
        );

        const secondCall = mockFetch.mock.calls[1];
        expect(secondCall?.[0]).toBe(
            'https://run.googleapis.com/v2/projects/sullivan-production-483212/locations/asia-northeast1/services/sullivan-app-production?update_mask=scaling.minInstanceCount',
        );
        expect(secondCall?.[1]).toEqual({
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer metadata-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scaling: {
                    minInstanceCount: 1,
                },
            }),
        });
        await expect(response.json()).resolves.toEqual({
            success: true,
            reason: 'weekday-warm-start',
            requestedMinInstances: 1,
            appliedMinInstances: 1,
            operationName: 'projects/example/locations/asia-northeast1/operations/test-op',
            cloudRunStatus: 200,
        });
    });

    it('minInstances=0 で Cloud Run API を呼び出す', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'metadata-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                scaling: { minInstanceCount: 0 },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', mockFetch);

        const response = await POST(
            createRequest({ minInstances: 0, reason: 'weekday-warm-stop' }),
        );

        expect(response.status).toBe(200);
        const secondCall = mockFetch.mock.calls[1];
        expect(secondCall?.[1]).toEqual({
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer metadata-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scaling: {
                    minInstanceCount: 0,
                },
            }),
        });
        await expect(response.json()).resolves.toEqual({
            success: true,
            reason: 'weekday-warm-stop',
            requestedMinInstances: 0,
            appliedMinInstances: 0,
            operationName: null,
            cloudRunStatus: 200,
        });
    });

    it('OIDC と secret header の組み合わせを受け入れる', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'metadata-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                scaling: { minInstanceCount: 1 },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', mockFetch);

        const response = await POST(
            createRequest(
                { minInstances: 1, reason: 'weekday-warm-start' },
                {
                    authHeader: 'Bearer oidc-token',
                    secretHeader: 'test-secret',
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            reason: 'weekday-warm-start',
            requestedMinInstances: 1,
            appliedMinInstances: 1,
            operationName: null,
            cloudRunStatus: 200,
        });
    });

    it('Cloud Run API の詳細をレスポンスに含めない', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'metadata-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                name: 'projects/example/locations/asia-northeast1/operations/test-op',
                scaling: { minInstanceCount: 1 },
                template: {
                    containers: [
                        {
                            env: [
                                { name: 'SECRET_VALUE', value: 'should-not-leak' },
                            ],
                        },
                    ],
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', mockFetch);

        const response = await POST(
            createRequest({ minInstances: 1, reason: 'weekday-warm-start' }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        expect(body).toEqual({
            success: true,
            reason: 'weekday-warm-start',
            requestedMinInstances: 1,
            appliedMinInstances: 1,
            operationName: 'projects/example/locations/asia-northeast1/operations/test-op',
            cloudRunStatus: 200,
        });
        expect(body).not.toHaveProperty('details');
        expect(body).not.toHaveProperty('projectId');
        expect(body).not.toHaveProperty('region');
        expect(body).not.toHaveProperty('serviceName');
    });

    it('Cloud Run API エラー時も詳細をレスポンスに含めない', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'metadata-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: {
                    message: 'permission denied',
                    details: [
                        { secret: 'should-not-leak' },
                    ],
                },
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', mockFetch);

        const response = await POST(
            createRequest({ minInstances: 1, reason: 'weekday-warm-start' }),
        );

        expect(response.status).toBe(502);
        const body = await response.json();
        expect(body).toEqual({
            success: false,
            error: 'Cloud Run service update failed',
        });
        expect(body).not.toHaveProperty('details');
    });
});
