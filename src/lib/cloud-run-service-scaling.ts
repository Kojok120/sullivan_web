type CloudRunMinInstancesReason = 'weekday-warm-start' | 'weekday-warm-stop';

type CloudRunMinInstancesPayload = {
    minInstances: 0 | 1;
    reason: CloudRunMinInstancesReason;
};

type CloudRunServiceTarget = {
    projectId: string;
    region: string;
    serviceName: string;
};

type CloudRunServiceUpdateResult = {
    status: number;
    appliedMinInstances: number | null;
    details: unknown;
};

const METADATA_ACCESS_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const CLOUD_RUN_API_BASE_URL = 'https://run.googleapis.com/v2';

export class CloudRunServiceScalingError extends Error {
    status: number;
    details: unknown;

    constructor(message: string, status: number, details: unknown = null) {
        super(message);
        this.name = 'CloudRunServiceScalingError';
        this.status = status;
        this.details = details;
    }
}

export function parseCloudRunMinInstancesPayload(value: unknown): CloudRunMinInstancesPayload | null {
    if (!value || typeof value !== 'object') return null;

    const minInstances = Reflect.get(value, 'minInstances');
    const reason = Reflect.get(value, 'reason');
    if (minInstances !== 0 && minInstances !== 1) return null;
    if (reason !== 'weekday-warm-start' && reason !== 'weekday-warm-stop') return null;

    return {
        minInstances,
        reason,
    };
}

export function resolveCloudRunServiceTarget(env: NodeJS.ProcessEnv = process.env): CloudRunServiceTarget {
    const projectId = env.GOOGLE_CLOUD_PROJECT_ID?.trim() || '';
    const region = env.CLOUD_RUN_REGION?.trim() || '';
    const serviceName = env.K_SERVICE?.trim() || '';
    const missingKeys = [
        !projectId ? 'GOOGLE_CLOUD_PROJECT_ID' : null,
        !region ? 'CLOUD_RUN_REGION' : null,
        !serviceName ? 'K_SERVICE' : null,
    ].filter((value): value is string => Boolean(value));

    if (missingKeys.length > 0) {
        throw new CloudRunServiceScalingError(
            `Cloud Run service target is not configured: ${missingKeys.join(', ')}`,
            500,
        );
    }

    return { projectId, region, serviceName };
}

function buildCloudRunServiceUrl(target: CloudRunServiceTarget) {
    const url = new URL(
        `${CLOUD_RUN_API_BASE_URL}/projects/${target.projectId}/locations/${target.region}/services/${target.serviceName}`,
    );
    url.searchParams.set('update_mask', 'scaling.minInstanceCount');
    return url.toString();
}

async function readResponseDetails(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

async function fetchMetadataAccessToken(fetchImpl: typeof fetch): Promise<string> {
    const response = await fetchImpl(METADATA_ACCESS_TOKEN_URL, {
        headers: {
            'Metadata-Flavor': 'Google',
        },
    });
    const details = await readResponseDetails(response);

    if (!response.ok) {
        throw new CloudRunServiceScalingError(
            'Failed to fetch metadata access token',
            502,
            details,
        );
    }

    const accessToken = (
        typeof details === 'object'
        && details !== null
        && 'access_token' in details
        && typeof details.access_token === 'string'
    )
        ? details.access_token
        : '';

    if (!accessToken) {
        throw new CloudRunServiceScalingError(
            'Metadata access token response is missing access_token',
            502,
            details,
        );
    }

    return accessToken;
}

export async function updateCloudRunMinInstances(
    target: CloudRunServiceTarget,
    payload: CloudRunMinInstancesPayload,
    fetchImpl: typeof fetch = fetch,
): Promise<CloudRunServiceUpdateResult> {
    const accessToken = await fetchMetadataAccessToken(fetchImpl);
    const response = await fetchImpl(buildCloudRunServiceUrl(target), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            scaling: {
                minInstanceCount: payload.minInstances,
            },
        }),
    });
    const details = await readResponseDetails(response);

    if (!response.ok) {
        throw new CloudRunServiceScalingError(
            'Cloud Run service update failed',
            502,
            details,
        );
    }

    const appliedMinInstances = (
        typeof details === 'object'
        && details !== null
        && 'scaling' in details
        && typeof details.scaling === 'object'
        && details.scaling !== null
        && 'minInstanceCount' in details.scaling
        && typeof details.scaling.minInstanceCount === 'number'
    )
        ? details.scaling.minInstanceCount
        : null;

    return {
        status: response.status,
        appliedMinInstances,
        details,
    };
}
