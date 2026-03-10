import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getSessionMock,
    getStudentAccessContextMock,
    canUseAiTutorMock,
    sendMessageMock,
    createChatMock,
    readFileSyncMock,
} = vi.hoisted(() => {
    const sendMessageMock = vi.fn();
    const createChatMock = vi.fn(() => ({
        sendMessage: sendMessageMock,
    }));

    return {
        getSessionMock: vi.fn(),
        getStudentAccessContextMock: vi.fn(),
        canUseAiTutorMock: vi.fn(),
        sendMessageMock,
        createChatMock,
        readFileSyncMock: vi.fn(() => 'あなたはプロの家庭教師です。'),
    };
});

vi.mock('@/lib/auth', () => ({
    getSession: getSessionMock,
}));

vi.mock('@/lib/authorization', () => ({
    getStudentAccessContext: getStudentAccessContextMock,
}));

vi.mock('@/lib/plan-entitlements', () => ({
    canUseAiTutor: canUseAiTutorMock,
}));

vi.mock('node:fs', () => ({
    default: {
        readFileSync: readFileSyncMock,
    },
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: class GoogleGenAIMock {
        chats = {
            create: createChatMock,
        };
    },
    HarmBlockThreshold: {
        BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
        BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
    },
    HarmCategory: {
        HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
        HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
        HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
    ThinkingLevel: {
        LOW: 'LOW',
    },
}));

const ORIGINAL_GEMINI_ENV = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL,
    GEMINI_CHAT_FALLBACK_MODEL: process.env.GEMINI_CHAT_FALLBACK_MODEL,
    GEMINI_CHAT_TIMEOUT_MS: process.env.GEMINI_CHAT_TIMEOUT_MS,
};

let POST: typeof import('@/app/api/tutor-chat/route').POST;

function createRequest(messages: Array<{ role: string; content: string }>) {
    return new NextRequest('http://localhost/api/tutor-chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            targetStudentId: 'student-1',
            problemContext: {
                question: '一次方程式を解いてください',
                answer: 'x=3',
                userAnswer: 'x=2',
                explanation: '移項して解きます',
            },
            messages,
        }),
    });
}

describe('tutor chat route', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.useRealTimers();
        sendMessageMock.mockReset();
        createChatMock.mockReset().mockImplementation(() => ({
            sendMessage: sendMessageMock,
        }));
        process.env.GEMINI_API_KEY = 'test-api-key';
        process.env.GEMINI_CHAT_MODEL = 'primary-model';
        process.env.GEMINI_CHAT_FALLBACK_MODEL = 'backup-model';
        process.env.GEMINI_CHAT_TIMEOUT_MS = '12000';
        readFileSyncMock.mockReturnValue('あなたはプロの家庭教師です。');
        getSessionMock.mockResolvedValue({
            userId: 'teacher-1',
            role: 'TEACHER',
            name: '先生',
        });
        getStudentAccessContextMock.mockResolvedValue({
            allowed: true,
            student: {
                id: 'student-1',
                role: 'STUDENT',
                classroomId: 'classroom-1',
                classroomPlan: 'PREMIUM',
            },
        });
        canUseAiTutorMock.mockReturnValue(true);
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        ({ POST } = await import('@/app/api/tutor-chat/route'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();

        for (const [key, value] of Object.entries(ORIGINAL_GEMINI_ENV)) {
            if (value === undefined) {
                delete process.env[key];
                continue;
            }

            process.env[key] = value;
        }
    });

    it('retryable error が続いても deadline 超過前に fallback reply を返す', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        sendMessageMock.mockImplementation(({ config }: { config: { abortSignal: AbortSignal } }) => new Promise((_, reject) => {
            const { abortSignal } = config;
            abortSignal.addEventListener('abort', () => {
                const error = new Error('timed out');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        }));

        const responsePromise = POST(createRequest([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: 'どこから考えればいいですか？' },
        ]));

        await vi.advanceTimersByTimeAsync(30_000);

        const response = await responsePromise;
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.reply).toContain('いい質問です。');
        const calledModels = ((createChatMock.mock.calls as unknown) as Array<[{ model: string }]>)
            .map(([params]) => params.model);
        expect(calledModels.length).toBeGreaterThan(0);
        expect(calledModels.length).toBeLessThanOrEqual(3);
        expect(calledModels[0]).toBe('primary-model');
    });

    it('ACK_ONLY の場合は Gemini を呼ばずに固定応答を返す', async () => {
        const response = await POST(createRequest([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: 'ありがとう' },
        ]));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.reply).toContain('次はどこを確認しましょうか');
        expect(createChatMock).not.toHaveBeenCalled();
    });

    it('正常応答時は Gemini の reply を返す', async () => {
        sendMessageMock.mockResolvedValue({
            text: '{"reply":"分配法則を使います"}',
        });

        const response = await POST(createRequest([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: '式の展開がわかりません' },
        ]));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.reply).toBe('分配法則を使います。');
    });

    it('primary model が non-retryable error でも fallback model で応答できれば返す', async () => {
        sendMessageMock
            .mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }))
            .mockResolvedValueOnce({
                text: '{"reply":"fallback model の回答です"}',
            });

        const response = await POST(createRequest([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: 'ここがわかりません' },
        ]));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.reply).toBe('fallback model の回答です。');
        expect(((createChatMock.mock.calls as unknown) as Array<[{ model: string }]>).map(([params]) => params.model)).toEqual([
            'primary-model',
            'backup-model',
        ]);
    });

    it('ai.chats.create が同期例外でも fallback reply を返す', async () => {
        createChatMock
            .mockImplementationOnce(() => {
                throw new Error('sync create failed');
            })
            .mockImplementationOnce(() => {
                throw new Error('sync create failed again');
            });

        const response = await POST(createRequest([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: 'ここがわかりません' },
        ]));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.reply).toContain('いい質問です。');
        expect(createChatMock).toHaveBeenCalledTimes(2);
        expect(sendMessageMock).not.toHaveBeenCalled();
    });
});
