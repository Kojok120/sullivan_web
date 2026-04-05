import { createPartFromUri, FileState, GoogleGenAI } from '@google/genai';

import { GEMINI_GUIDANCE_AUDIO_MIME_TYPE, GeminiGuidanceAudioMimeType } from '@/lib/guidance-audio-transcoder';
import { GuidanceSummary } from '@/lib/guidance-recording';
import { loadInstructionPrompt } from '@/lib/instruction-prompt';

const DEFAULT_GUIDANCE_SUMMARY_MODEL = 'gemini-3.1-pro-preview';
const GUIDANCE_SUMMARY_FILE_POLL_INTERVAL_MS = 3_000;
const GUIDANCE_SUMMARY_FILE_POLL_TIMEOUT_MS = 240_000;

const GUIDANCE_SUMMARY_ERROR_MESSAGES = {
    ffmpeg_missing: '音声変換に必要な ffmpeg が見つかりませんでした。',
    audio_transcode_failed: '音声ファイルの変換に失敗しました。',
    gemini_api_key_missing: 'Gemini API キーが設定されていません。',
    gemini_upload_failed: 'Gemini への音声アップロードに失敗しました。',
    gemini_file_processing_failed: 'Gemini 側で音声ファイルの処理に失敗しました。',
    gemini_file_processing_timeout: 'Gemini 側の音声ファイル処理が時間内に完了しませんでした。',
    gemini_generate_failed: 'AI 要約の生成に失敗しました。',
    gemini_response_empty: 'AI 要約の応答が空でした。',
    gemini_response_invalid: 'AI 要約の応答形式が不正でした。',
    queue_publish_failed: '要約ジョブの登録に失敗しました。',
    guidance_record_not_found: '面談記録が見つかりませんでした。',
    guidance_record_invalid_state: '要約ジョブの状態が不正です。',
    guidance_record_missing_file: '要約対象の音声ファイル情報が見つかりませんでした。',
    guidance_record_save_failed: '面談記録の保存に失敗しました。',
    unexpected: 'AI 要約に失敗しました。',
} as const;

export type GuidanceSummaryErrorCode = keyof typeof GUIDANCE_SUMMARY_ERROR_MESSAGES;

const responseSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        topics: {
            type: 'array',
            items: { type: 'string' },
        },
        currentStatus: {
            type: 'array',
            items: { type: 'string' },
        },
        concerns: {
            type: 'array',
            items: { type: 'string' },
        },
        agreements: {
            type: 'array',
            items: { type: 'string' },
        },
        nextActions: {
            type: 'array',
            items: { type: 'string' },
        },
        followUpPoints: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: [
        'summary',
        'topics',
        'currentStatus',
        'concerns',
        'agreements',
        'nextActions',
        'followUpPoints',
    ],
    additionalProperties: false,
} as const;

type FileClient = Pick<GoogleGenAI, 'files'>;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateLogMessage(message: string, maxLength = 2_000) {
    const normalized = message.trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 3)}...`;
}

export class GuidanceSummaryError extends Error {
    code: GuidanceSummaryErrorCode;
    displayMessage: string;

    constructor(code: GuidanceSummaryErrorCode, detail?: string, displayMessage?: string) {
        super(detail ?? displayMessage ?? GUIDANCE_SUMMARY_ERROR_MESSAGES[code]);
        this.name = 'GuidanceSummaryError';
        this.code = code;
        this.displayMessage = displayMessage ?? GUIDANCE_SUMMARY_ERROR_MESSAGES[code];
    }
}

export function getGuidanceSummaryErrorMessage(code: GuidanceSummaryErrorCode) {
    return GUIDANCE_SUMMARY_ERROR_MESSAGES[code];
}

export function normalizeGuidanceSummaryError(
    error: unknown,
    fallbackCode: GuidanceSummaryErrorCode = 'unexpected',
) {
    if (error instanceof GuidanceSummaryError) {
        return {
            code: error.code,
            userMessage: error.displayMessage,
            logMessage: truncateLogMessage(error.message),
        };
    }

    const rawMessage = truncateLogMessage(error instanceof Error ? error.message : String(error));

    if (rawMessage === 'ffmpeg is not installed') {
        return {
            code: 'ffmpeg_missing' as const,
            userMessage: getGuidanceSummaryErrorMessage('ffmpeg_missing'),
            logMessage: rawMessage,
        };
    }

    if (error instanceof SyntaxError || rawMessage.includes('summary is empty')) {
        return {
            code: 'gemini_response_invalid' as const,
            userMessage: getGuidanceSummaryErrorMessage('gemini_response_invalid'),
            logMessage: rawMessage,
        };
    }

    if (rawMessage === 'GEMINI_API_KEY is not set') {
        return {
            code: 'gemini_api_key_missing' as const,
            userMessage: getGuidanceSummaryErrorMessage('gemini_api_key_missing'),
            logMessage: rawMessage,
        };
    }

    return {
        code: fallbackCode,
        userMessage: getGuidanceSummaryErrorMessage(fallbackCode),
        logMessage: rawMessage,
    };
}

export function formatDateTimeForPrompt(date: Date, timeZone: string | undefined): string {
    try {
        return new Intl.DateTimeFormat('ja-JP', {
            timeZone,
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    } catch {
        return new Intl.DateTimeFormat('ja-JP', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    }
}

export function buildInterviewSummaryPrompt(params: {
    studentName: string;
    teacherName: string;
    recordedAt: Date;
    durationMinutes: number | null;
    timeZone?: string | null;
}) {
    return loadInstructionPrompt('interview-summary-prompt.md', {
        studentName: params.studentName,
        teacherName: params.teacherName,
        recordedAt: formatDateTimeForPrompt(params.recordedAt, params.timeZone ?? undefined),
        durationMinutes: params.durationMinutes ?? '不明',
    });
}

function parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function parseGuidanceSummaryResponse(rawText: string): GuidanceSummary {
    const normalized = rawText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    const parsed = JSON.parse(normalized) as {
        summary?: unknown;
        topics?: unknown;
        currentStatus?: unknown;
        concerns?: unknown;
        agreements?: unknown;
        nextActions?: unknown;
        followUpPoints?: unknown;
    };

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
        throw new GuidanceSummaryError('gemini_response_invalid', 'summary is empty');
    }

    return {
        summary,
        topics: parseStringArray(parsed.topics),
        currentStatus: parseStringArray(parsed.currentStatus),
        concerns: parseStringArray(parsed.concerns),
        agreements: parseStringArray(parsed.agreements),
        nextActions: parseStringArray(parsed.nextActions),
        followUpPoints: parseStringArray(parsed.followUpPoints),
    };
}

export function createGuidanceSummaryClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new GuidanceSummaryError('gemini_api_key_missing', 'GEMINI_API_KEY is not set');
    }

    return new GoogleGenAI({ apiKey });
}

export async function uploadGuidanceAudioFileToGemini(params: {
    ai?: GoogleGenAI;
    audioFile: File;
    audioMimeType: GeminiGuidanceAudioMimeType;
}) {
    const ai = params.ai ?? createGuidanceSummaryClient();

    try {
        const uploaded = await ai.files.upload({
            file: params.audioFile,
            config: {
                mimeType: params.audioMimeType,
                displayName: `guidance-audio-${Date.now()}`,
            },
        });

        if (!uploaded.name) {
            throw new GuidanceSummaryError(
                'gemini_upload_failed',
                'Gemini upload completed without file name',
            );
        }

        return {
            fileName: uploaded.name,
            mimeType: params.audioMimeType,
        };
    } catch (error) {
        const normalized = normalizeGuidanceSummaryError(error, 'gemini_upload_failed');
        throw new GuidanceSummaryError(normalized.code, normalized.logMessage, normalized.userMessage);
    }
}

export async function waitForGeminiFileActive(params: {
    ai: FileClient;
    fileName: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
}) {
    const timeoutMs = params.timeoutMs ?? GUIDANCE_SUMMARY_FILE_POLL_TIMEOUT_MS;
    const pollIntervalMs = params.pollIntervalMs ?? GUIDANCE_SUMMARY_FILE_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
        const file = await params.ai.files.get({ name: params.fileName });
        const state = file.state ?? FileState.STATE_UNSPECIFIED;

        if (state === FileState.ACTIVE) {
            if (!file.uri) {
                throw new GuidanceSummaryError(
                    'gemini_file_processing_failed',
                    `Gemini file is ACTIVE but uri is empty: ${params.fileName}`,
                );
            }

            return {
                fileName: params.fileName,
                fileUri: file.uri,
            };
        }

        if (state === FileState.FAILED) {
            const detail = typeof file.error?.message === 'string'
                ? file.error.message
                : `Gemini file processing failed: ${params.fileName}`;
            throw new GuidanceSummaryError('gemini_file_processing_failed', detail);
        }

        await sleep(pollIntervalMs);
    }

    throw new GuidanceSummaryError(
        'gemini_file_processing_timeout',
        `Timed out waiting for Gemini file to become ACTIVE: ${params.fileName}`,
    );
}

export async function generateInterviewSummaryFromGeminiFile(params: {
    ai?: GoogleGenAI;
    fileUri: string;
    audioMimeType?: GeminiGuidanceAudioMimeType;
    prompt: string;
}) {
    const ai = params.ai ?? createGuidanceSummaryClient();
    const audioMimeType = params.audioMimeType ?? GEMINI_GUIDANCE_AUDIO_MIME_TYPE;

    try {
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_CHAT_MODEL || DEFAULT_GUIDANCE_SUMMARY_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    { text: params.prompt },
                    createPartFromUri(params.fileUri, audioMimeType),
                ],
            }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: responseSchema,
                maxOutputTokens: 2048,
            },
        });

        const rawText = response.text?.trim();
        if (!rawText) {
            throw new GuidanceSummaryError('gemini_response_empty', 'empty response text');
        }

        return parseGuidanceSummaryResponse(rawText);
    } catch (error) {
        const normalized = normalizeGuidanceSummaryError(
            error,
            error instanceof GuidanceSummaryError ? error.code : 'gemini_generate_failed',
        );
        throw new GuidanceSummaryError(normalized.code, normalized.logMessage, normalized.userMessage);
    }
}

export async function deleteGuidanceGeminiFile(params: {
    ai?: GoogleGenAI;
    fileName: string;
}) {
    const ai = params.ai ?? createGuidanceSummaryClient();
    await ai.files.delete({ name: params.fileName });
}
