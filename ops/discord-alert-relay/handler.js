export const MAX_DISCORD_CONTENT_LENGTH = 1800;
const MAX_SUMMARY_LENGTH = 900;

function truncateText(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeInlineText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.replace(/\s+/g, ' ').trim();
}

export function parseMonitoringPayload(event, logger = console) {
    if (event && typeof event === 'object' && event.incident && typeof event.incident === 'object') {
        return event;
    }

    const encodedMessage = event?.data?.message?.data;
    if (typeof encodedMessage !== 'string' || encodedMessage.length === 0) {
        logger.warn('Pub/Sub メッセージ本体が見つからないため、Discord 通知をスキップします。');
        return null;
    }

    try {
        const raw = Buffer.from(encodedMessage, 'base64').toString('utf8');
        return JSON.parse(raw);
    } catch (error) {
        logger.error('Pub/Sub メッセージのデコードに失敗したため、Discord 通知をスキップします。', error);
        return null;
    }
}

export function extractIncident(payload, logger = console) {
    const incident = payload?.incident;
    if (!incident || typeof incident !== 'object') {
        logger.warn('Monitoring incident が見つからないため、Discord 通知をスキップします。');
        return null;
    }

    return incident;
}

function resolveServiceName(incident) {
    const candidates = [
        incident?.resource?.labels?.service_name,
        incident?.resource_display_name,
        incident?.resource_name,
        incident?.resource?.type,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeInlineText(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return 'unknown service';
}

export function buildDiscordMessage(incident) {
    const state = normalizeInlineText(incident?.state).toUpperCase() || 'UNKNOWN';
    const policyName = normalizeInlineText(incident?.policy_name) || 'Unknown policy';
    const serviceName = resolveServiceName(incident);
    const projectId = normalizeInlineText(incident?.scoping_project_id);
    const summary = truncateText(
        normalizeInlineText(incident?.summary) || '概要の記載なし',
        MAX_SUMMARY_LENGTH,
    );
    const incidentUrl = normalizeInlineText(incident?.url);

    const lines = [
        `[Sullivan Alert][${state}] ${policyName}`,
        `service: ${serviceName}`,
    ];

    if (projectId) {
        lines.push(`project: ${projectId}`);
    }

    lines.push(`summary: ${summary}`);

    if (incidentUrl) {
        lines.push(`incident: ${incidentUrl}`);
    }

    return truncateText(lines.join('\n'), MAX_DISCORD_CONTENT_LENGTH);
}

export async function sendDiscordNotification(
    content,
    {
        fetchImpl = globalThis.fetch,
        webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL,
    } = {},
) {
    if (!webhookUrl) {
        throw new Error('DISCORD_ALERT_WEBHOOK_URL is not set');
    }

    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch is not available');
    }

    const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content,
            allowed_mentions: { parse: [] },
        }),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
            `Discord webhook request failed with status ${response.status}: ${truncateText(responseText, 200)}`,
        );
    }

    return response;
}

export async function monitoringAlertToDiscord(event, options = {}) {
    const logger = options.logger ?? console;
    const payload = parseMonitoringPayload(event, logger);
    if (!payload) {
        return { skipped: true };
    }

    const incident = extractIncident(payload, logger);
    if (!incident) {
        return { skipped: true };
    }

    const content = buildDiscordMessage(incident);
    await sendDiscordNotification(content, {
        fetchImpl: options.fetchImpl,
        webhookUrl: options.webhookUrl,
    });

    logger.log(`Discord に Monitoring アラートを送信しました: ${normalizeInlineText(incident.policy_name) || 'Unknown policy'}`);

    return {
        skipped: false,
        content,
    };
}
