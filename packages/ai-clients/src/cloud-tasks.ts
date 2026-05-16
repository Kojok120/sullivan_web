import { cloudtasks_v2, google } from 'googleapis';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const DEFAULT_CLOUD_TASKS_LOCATION = 'asia-northeast1';
export const DEFAULT_GRADING_TASK_QUEUE = 'sullivan-grading';
export const DEFAULT_DRIVE_CHECK_TASK_QUEUE = 'sullivan-drive-check';
export const DEFAULT_GUIDANCE_SUMMARY_TASK_QUEUE = 'sullivan-guidance-summary';

type TaskPayload = Record<string, unknown>;

export interface BuiltCloudTaskRequest {
    parent: string;
    requestBody: {
        task: {
            scheduleTime?: string;
            httpRequest: {
                httpMethod: 'POST';
                url: string;
                headers: Record<string, string>;
                body: string;
                oidcToken: {
                    serviceAccountEmail: string;
                    audience: string;
                };
            };
        };
    };
}

export interface BuildCloudTaskRequestOptions {
    queue: string;
    path: string;
    payload: TaskPayload;
    delaySeconds?: number;
}

let cloudTasksClient: cloudtasks_v2.Cloudtasks | null = null;

function getCloudTasksClient(): cloudtasks_v2.Cloudtasks {
    if (!cloudTasksClient) {
        const auth = new google.auth.GoogleAuth({
            scopes: [CLOUD_PLATFORM_SCOPE],
        });
        cloudTasksClient = google.cloudtasks({
            version: 'v2',
            auth,
        });
    }

    return cloudTasksClient;
}

function requireEnv(name: string, value: string | undefined): string {
    const trimmed = value?.trim();
    if (!trimmed) {
        throw new Error(`${name} is missing`);
    }
    return trimmed;
}

function resolveWorkerBaseUrl(): string {
    return requireEnv('GRADING_WORKER_URL', process.env.GRADING_WORKER_URL).replace(/\/+$/, '');
}

function resolveCloudTasksProjectId(): string {
    return requireEnv('GOOGLE_CLOUD_PROJECT_ID', process.env.GOOGLE_CLOUD_PROJECT_ID);
}

function resolveCloudTasksLocation(): string {
    return (process.env.CLOUD_TASKS_LOCATION || DEFAULT_CLOUD_TASKS_LOCATION).trim() || DEFAULT_CLOUD_TASKS_LOCATION;
}

function resolveCloudTasksCallerServiceAccount(): string {
    return requireEnv(
        'CLOUD_TASKS_CALLER_SERVICE_ACCOUNT',
        process.env.CLOUD_TASKS_CALLER_SERVICE_ACCOUNT || process.env.RUNTIME_SA_EMAIL,
    );
}

export function buildCloudTaskRequest({
    queue,
    path,
    payload,
    delaySeconds = 0,
}: BuildCloudTaskRequestOptions): BuiltCloudTaskRequest {
    const projectId = resolveCloudTasksProjectId();
    const location = resolveCloudTasksLocation();
    const callerServiceAccount = resolveCloudTasksCallerServiceAccount();
    const baseUrl = resolveWorkerBaseUrl();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const task: BuiltCloudTaskRequest['requestBody']['task'] = {
        httpRequest: {
            httpMethod: 'POST',
            url: `${baseUrl}${normalizedPath}`,
            headers: {
                'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
            oidcToken: {
                serviceAccountEmail: callerServiceAccount,
                audience: baseUrl,
            },
        },
    };

    if (delaySeconds > 0) {
        task.scheduleTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
    }

    return {
        parent: `projects/${projectId}/locations/${location}/queues/${queue}`,
        requestBody: { task },
    };
}

export async function enqueueCloudTask(options: BuildCloudTaskRequestOptions): Promise<void> {
    const client = getCloudTasksClient();
    const request = buildCloudTaskRequest(options);

    await client.projects.locations.queues.tasks.create({
        parent: request.parent,
        requestBody: request.requestBody,
    });
}
