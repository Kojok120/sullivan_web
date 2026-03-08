import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/internal/cloud-run/min-instances/route';

function createRequest(body: unknown, authHeader = 'Bearer test-secret') {
    return new Request('http://localhost/api/internal/cloud-run/min-instances', {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
        },
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
                'Bearer wrong-secret',
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
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            requestedMinInstances: 1,
            appliedMinInstances: 1,
            reason: 'weekday-warm-start',
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
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            requestedMinInstances: 0,
            appliedMinInstances: 0,
            reason: 'weekday-warm-stop',
        });
    });
});
