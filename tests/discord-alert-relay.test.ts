import { describe, expect, it, vi } from 'vitest';
import {
    buildDiscordPayload,
    buildDiscordMessage,
    MAX_DISCORD_CONTENT_LENGTH,
    monitoringAlertToDiscord,
} from '../ops/discord-alert-relay/handler.js';

function createCloudEvent(payload: unknown) {
    return {
        data: {
            message: {
                data: Buffer.from(JSON.stringify(payload)).toString('base64'),
            },
        },
    };
}

function createLogger() {
    return {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
}

function createIncident(overrides: Record<string, unknown> = {}) {
    return {
        state: 'open',
        policy_name: 'Sullivan Web Production Error Logs',
        summary: 'Web request failed',
        url: 'https://console.cloud.google.com/monitoring/alerting/incidents/123',
        scoping_project_id: 'sullivan-production',
        resource: {
            labels: {
                service_name: 'sullivan-app-production',
            },
        },
        ...overrides,
    };
}

describe('discord-alert-relay', () => {
    it('OPEN incident を Discord 向けに整形して送信する', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
        const logger = createLogger();

        const result = await monitoringAlertToDiscord(
            createCloudEvent({ incident: createIncident() }),
            {
                fetchImpl,
                webhookUrl: 'https://discord.example/webhook',
                mention: '<@&1234567890>',
                logger,
            },
        );

        expect(result.skipped).toBe(false);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://discord.example/webhook',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.allowed_mentions).toEqual({ parse: ['users', 'roles'] });
        expect(body.content).toContain('<@&1234567890>');
        expect(body.content).toContain('[Sullivan Alert][OPEN] Sullivan Web Production Error Logs');
        expect(body.content).toContain('service: sullivan-app-production');
        expect(body.content).toContain('summary: Web request failed');
        expect(body.content).toContain('incident: https://console.cloud.google.com/monitoring/alerting/incidents/123');
        expect(logger.log).toHaveBeenCalledTimes(1);
    });

    it('CLOSED incident を整形する', () => {
        const content = buildDiscordMessage(
            createIncident({
                state: 'closed',
                summary: 'Service recovered',
            }),
        );

        expect(content).toContain('[Sullivan Alert][CLOSED] Sullivan Web Production Error Logs');
        expect(content).toContain('summary: Service recovered');
    });

    it('CLOSED incident はメンションしない payload にする', () => {
        const payload = buildDiscordPayload(
            buildDiscordMessage(
                createIncident({
                    state: 'closed',
                }),
            ),
            {
                mention: '<@&1234567890>',
                enableMention: false,
            },
        );

        expect(payload.allowed_mentions).toEqual({ parse: [] });
        expect(payload.content).not.toContain('<@&1234567890>');
    });

    it('service_name がない場合は fallback を使う', () => {
        const content = buildDiscordMessage(
            createIncident({
                resource: {},
                resource_display_name: 'fallback-display-name',
            }),
        );

        expect(content).toContain('service: fallback-display-name');
    });

    it('メッセージ長を 1800 文字以内に切り詰める', () => {
        const content = buildDiscordMessage(
            createIncident({
                summary: 'a'.repeat(4000),
            }),
        );

        expect(content.length).toBeLessThanOrEqual(MAX_DISCORD_CONTENT_LENGTH);
        expect(content).toContain('summary:');
        expect(content).toContain('...');
        expect(content).not.toContain('a'.repeat(2000));
    });

    it('malformed payload のときは落とさずにスキップする', async () => {
        const fetchImpl = vi.fn();
        const logger = createLogger();

        const result = await monitoringAlertToDiscord(
            {
                data: {
                    message: {
                        data: 'not-json',
                    },
                },
            },
            {
                fetchImpl,
                webhookUrl: 'https://discord.example/webhook',
                logger,
            },
        );

        expect(result).toEqual({ skipped: true });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('メンション設定が空なら OPEN incident でもメンションしない', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
        const logger = createLogger();

        await monitoringAlertToDiscord(
            createCloudEvent({ incident: createIncident() }),
            {
                fetchImpl,
                webhookUrl: 'https://discord.example/webhook',
                mention: '',
                logger,
            },
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.allowed_mentions).toEqual({ parse: [] });
        expect(body.content).not.toContain('<@&');
    });
});
