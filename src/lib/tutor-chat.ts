import type { Content, GenerateContentResponse, Part } from '@google/genai';

export type TutorChatModelContentPart = {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
};

export type TutorChatModelContent = {
    role: 'model';
    parts: TutorChatModelContentPart[];
};

export type TutorChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    modelContent?: TutorChatModelContent;
};

export type TutorChatResponseBody = {
    reply: string;
    modelContent?: TutorChatModelContent;
};

type SanitizeTutorChatMessagesOptions = {
    maxHistoryMessages: number;
    maxMessageChars: number;
};

function sanitizeTutorChatModelContentPart(value: unknown): TutorChatModelContentPart | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as {
        text?: unknown;
        thought?: unknown;
        thoughtSignature?: unknown;
    };

    const text = typeof record.text === 'string' ? record.text.trim() : '';
    const thought = record.thought === true;
    const thoughtSignature = typeof record.thoughtSignature === 'string'
        ? record.thoughtSignature.trim()
        : '';

    if (!text && !thoughtSignature) {
        return null;
    }

    return {
        ...(text ? { text } : {}),
        ...(thought ? { thought: true } : {}),
        ...(thoughtSignature ? { thoughtSignature } : {}),
    };
}

export function sanitizeTutorChatModelContent(value: unknown): TutorChatModelContent | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const record = value as {
        role?: unknown;
        parts?: unknown;
    };

    if (record.role !== 'model' || !Array.isArray(record.parts)) {
        return undefined;
    }

    const parts = record.parts
        .map((part) => sanitizeTutorChatModelContentPart(part))
        .filter((part): part is TutorChatModelContentPart => part !== null);

    if (parts.length === 0) {
        return undefined;
    }

    return { role: 'model', parts };
}

export function sanitizeTutorChatMessages(
    rawMessages: unknown,
    options: SanitizeTutorChatMessagesOptions,
) {
    if (!Array.isArray(rawMessages)) return [] as TutorChatMessage[];

    return rawMessages
        .filter((message): message is TutorChatMessage => {
            if (!message || typeof message !== 'object') return false;
            const record = message as {
                role?: unknown;
                content?: unknown;
            };
            const roleIsValid = record.role === 'user' || record.role === 'assistant';
            return roleIsValid && typeof record.content === 'string';
        })
        .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, options.maxMessageChars),
            ...(message.role === 'assistant'
                ? { modelContent: sanitizeTutorChatModelContent(message.modelContent) }
                : {}),
        }))
        .filter((message) => message.content.length > 0)
        .slice(-options.maxHistoryMessages);
}

function toModelPart(part: TutorChatModelContentPart): Part {
    return {
        ...(part.text ? { text: part.text } : {}),
        ...(part.thought ? { thought: true } : {}),
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
    };
}

function toContent(message: TutorChatMessage): Content {
    if (message.role === 'assistant') {
        const parts = message.modelContent?.parts.map((part) => toModelPart(part))
            ?? [{ text: message.content }];
        return {
            role: 'model',
            parts,
        };
    }

    return {
        role: 'user',
        parts: [{ text: message.content }],
    };
}

export function buildTutorChatHistory(messages: TutorChatMessage[]): Content[] {
    const history: Content[] = [];

    for (const message of messages) {
        if (message.role === 'assistant' && history.length === 0) {
            continue;
        }

        const content = toContent(message);
        const expectedRole = history.length % 2 === 0 ? 'user' : 'model';
        if (content.role !== expectedRole) {
            continue;
        }

        history.push(content);
    }

    return history;
}

export function extractTutorChatModelContent(response: GenerateContentResponse): TutorChatModelContent | undefined {
    return sanitizeTutorChatModelContent(response.candidates?.[0]?.content);
}

export function normalizeTutorChatModelContentForHistory(
    modelContent: TutorChatModelContent | undefined,
    reply: string,
): TutorChatModelContent | undefined {
    if (!modelContent) {
        return reply
            ? {
                role: 'model' as const,
                parts: [{ text: reply }],
            }
            : undefined;
    }

    const nextParts: TutorChatModelContentPart[] = [];
    let replacedReplyText = false;

    for (const part of modelContent.parts) {
        if (!part.thought && typeof part.text === 'string' && !replacedReplyText) {
            nextParts.push({ text: reply });
            replacedReplyText = true;
            continue;
        }

        nextParts.push(part);
    }

    if (!replacedReplyText && reply) {
        nextParts.push({ text: reply });
    }

    return {
        role: 'model',
        parts: nextParts,
    };
}
