import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCloudTaskRequest } from '@/lib/cloud-tasks';

describe('cloud-tasks', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-09T03:04:05Z'));
        vi.stubEnv('GOOGLE_CLOUD_PROJECT_ID', 'test-project');
        vi.stubEnv('GRADING_WORKER_URL', 'https://worker-example.run.app/');
        vi.stubEnv('CLOUD_TASKS_CALLER_SERVICE_ACCOUNT', 'runtime@test-project.iam.gserviceaccount.com');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('Cloud Tasks の HTTP task を OIDC 付きで組み立てる', () => {
        const request = buildCloudTaskRequest({
            queue: 'sullivan-drive-check',
            path: '/api/queue/drive-check',
            payload: { source: 'webhook', state: 'change', channelId: 'channel-1' },
            delaySeconds: 5,
        });

        expect(request.parent).toBe('projects/test-project/locations/asia-northeast1/queues/sullivan-drive-check');
        expect(request.requestBody.task.scheduleTime).toBe('2026-03-09T03:04:10.000Z');
        expect(request.requestBody.task.httpRequest).toEqual({
            httpMethod: 'POST',
            url: 'https://worker-example.run.app/api/queue/drive-check',
            headers: {
                'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify({
                source: 'webhook',
                state: 'change',
                channelId: 'channel-1',
            }), 'utf8').toString('base64'),
            oidcToken: {
                serviceAccountEmail: 'runtime@test-project.iam.gserviceaccount.com',
                audience: 'https://worker-example.run.app',
            },
        });
    });
});
