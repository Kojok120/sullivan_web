import { NextRequest, NextResponse } from 'next/server';
import {
    GoogleGenAI,
    HarmBlockThreshold,
    HarmCategory,
    Type,
    type GenerateContentResponse,
} from '@google/genai';
import { getSession } from '@/lib/auth';
import fs from 'node:fs';
import path from 'node:path';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type TutorChatRequest = {
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    messages: ChatMessage[];
};

type TutorReplySchema = {
    reply?: unknown;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
const CHAT_FALLBACK_MODEL = process.env.GEMINI_CHAT_FALLBACK_MODEL || 'gemini-2.5-flash-lite';
const CHAT_TIMEOUT_MS = Math.max(2_000, Number.parseInt(process.env.GEMINI_CHAT_TIMEOUT_MS || '12000', 10) || 12_000);
const MAX_MESSAGE_CHARS = 1000;
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_API_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const BAD_ENDING_REGEX = /(残りの|まず|次に|では|そして|たとえば|例えば)[。！？!?]?$/;
const DANGLING_END_REGEX = /[、,:：;；]$/;
const INCOMPLETE_PHRASE_END_REGEX = /(まず|次に|そして|たとえば|例えば|つまり|なので|だから)$/;
const ACK_ONLY_REGEX = /^(なるほど|ありがとう|ありがとうございます|わかった|わかりました|了解|はい|うん|ok|OK|助かった|助かります)[。!！?？\s]*$/;
const TRANSLATION_HINT_REGEX = /(英語|英文|英訳|訳して|翻訳|英語で|translate|in english)/i;
const TRANSIENT_ERROR_CODES = new Set([408, 429, 500, 502, 503, 504]);

const CHAT_PROMPT_PATH = path.join(process.cwd(), 'src/prompts/chat-tutor.md');
const DEFAULT_SYSTEM_PROMPT = [
    'あなたはプロの家庭教師です。',
    '生徒の理解を優先し、簡潔で自然な日本語で答えてください。',
].join('\n');
const CHAT_SYSTEM_PROMPT = loadChatSystemPrompt();

const SAFETY_SETTINGS = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
];

const REPLY_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        reply: {
            type: Type.STRING,
            description: '生徒に返す日本語の返答（2〜4文）',
        },
    },
    required: ['reply'],
};

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function loadChatSystemPrompt() {
    try {
        const loaded = fs.readFileSync(CHAT_PROMPT_PATH, 'utf-8').trim();
        return loaded || DEFAULT_SYSTEM_PROMPT;
    } catch (error) {
        console.warn('[TutorChat] Failed to load chat prompt file. Falling back to default prompt.', error);
        return DEFAULT_SYSTEM_PROMPT;
    }
}

function sanitizeText(value: unknown, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.trim();
}

function sanitizeMessages(rawMessages: unknown) {
    if (!Array.isArray(rawMessages)) return [] as ChatMessage[];

    return rawMessages
        .filter((message): message is ChatMessage => {
            if (!message || typeof message !== 'object') return false;
            const record = message as { role?: unknown; content?: unknown };
            const roleIsValid = record.role === 'user' || record.role === 'assistant';
            return roleIsValid && typeof record.content === 'string';
        })
        .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
        }))
        .filter((message) => message.content.length > 0)
        .slice(-MAX_HISTORY_MESSAGES);
}

function formatTranscript(messages: ChatMessage[]) {
    const selected: ChatMessage[] = [];
    let totalChars = 0;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        const speaker = message.role === 'user' ? '生徒' : '先生';
        const line = `${speaker}: ${message.content}`;
        const lineChars = line.length + 1;

        if (selected.length > 0 && totalChars + lineChars > MAX_TRANSCRIPT_CHARS) {
            break;
        }

        selected.unshift(message);
        totalChars += lineChars;
    }

    return selected
        .map((message) => {
            const speaker = message.role === 'user' ? '生徒' : '先生';
            return `${speaker}: ${message.content}`;
        })
        .join('\n');
}

function normalizeTutorReply(text: string) {
    let reply = text.trim();
    if (!reply) return reply;

    const looksDangling = DANGLING_END_REGEX.test(reply) || INCOMPLETE_PHRASE_END_REGEX.test(reply);
    if (looksDangling) {
        reply = reply.replace(DANGLING_END_REGEX, '').trim();
    }

    if (!/[。！？!?]$/.test(reply)) {
        reply += '。';
    }

    return reply;
}

function isUnnaturalReply(text: string) {
    const reply = text.trim();
    if (!reply) return true;
    if (reply.length < 6) return true;
    if (BAD_ENDING_REGEX.test(reply)) return true;
    if (/[「『][^」』]*$/.test(reply)) return true;
    if (!/[。！？!?]$/.test(reply)) return true;
    return false;
}

function buildFallbackReply(latestUserMessage: string, translationMode: boolean) {
    if (translationMode) {
        return `「${latestUserMessage}」は文脈で訳が少し変わります。対象の日本語をもう一度そのまま送ってくれたら、自然な英訳を1つに絞って示します。`;
    }
    return 'いい質問です。要点を1つずつ確認しましょう。いま一番わからない語句か手順を1つだけ教えてください。';
}

function parseReplyFromJsonText(text: string) {
    const normalized = text.trim();
    if (!normalized) return '';

    try {
        const parsed = JSON.parse(normalized) as TutorReplySchema;
        if (typeof parsed.reply === 'string') {
            return parsed.reply.trim();
        }
    } catch {
        // JSON出力に失敗した場合のみ素のテキストをフォールバックに使う
        return normalized;
    }

    return '';
}

function parseStatusCode(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;

    const record = error as {
        status?: unknown;
        code?: unknown;
        cause?: { status?: unknown; code?: unknown };
    };

    const candidates = [record.status, record.code, record.cause?.status, record.cause?.code];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return candidate;
        }
    }

    return null;
}

function isTimeoutError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const record = error as { name?: unknown; message?: unknown };
    if (record.name === 'AbortError') return true;

    if (typeof record.message === 'string') {
        return /timeout|timed out|deadline/i.test(record.message);
    }

    return false;
}

function isRetryableError(error: unknown) {
    const status = parseStatusCode(error);
    if (status && TRANSIENT_ERROR_CODES.has(status)) return true;
    return isTimeoutError(error);
}

async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithTimeout(
    ai: GoogleGenAI,
    model: string,
    prompt: string,
): Promise<GenerateContentResponse> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), CHAT_TIMEOUT_MS);

    try {
        return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                abortSignal: abortController.signal,
                systemInstruction: CHAT_SYSTEM_PROMPT,
                temperature: 0.3,
                topP: 0.9,
                maxOutputTokens: 512,
                responseMimeType: 'application/json',
                responseSchema: REPLY_SCHEMA,
                safetySettings: SAFETY_SETTINGS,
            },
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildTutorPrompt({
    question,
    answer,
    userAnswer,
    explanation,
    transcript,
    latestUserMessage,
    translationMode,
}: {
    question: string;
    answer: string;
    userAnswer: string;
    explanation: string;
    transcript: string;
    latestUserMessage: string;
    translationMode: boolean;
}) {
    return [
        '以下の情報を使って、生徒への次の返答を作成してください。',
        '',
        '【生徒が現在解いている問題】',
        `問題: ${question}`,
        `正解: ${answer}`,
        `生徒の回答: ${userAnswer}`,
        `解説: ${explanation}`,
        '',
        '【ここまでの会話】',
        transcript || '（会話なし）',
        '',
        '【今回対応する生徒の最新発話】',
        latestUserMessage,
        '',
        '【出力ルール】',
        '- 必ずJSONのみを返す（例: {"reply":"..."}）',
        '- replyには先生としての返答本文だけを入れる',
        '- 日本語で2〜4文、結論を先に、補足は短く',
        '- 返答を途中で切らない',
        '- 最後は「。」「？」「！」のいずれかで終える',
        translationMode
            ? '- 今回は訳の相談なので、最初の文で訳を明確に示す'
            : '- 生徒の思考を促す短い問いかけを最後に1つまで含めてよい',
    ].join('\n');
}

async function generateTutorReply({
    ai,
    prompt,
}: {
    ai: GoogleGenAI;
    prompt: string;
}) {
    const models = Array.from(new Set([CHAT_MODEL, CHAT_FALLBACK_MODEL].filter(Boolean)));
    let lastError: unknown = null;

    for (const model of models) {
        for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt += 1) {
            try {
                const response = await callGeminiWithTimeout(ai, model, prompt);
                const candidateText = response.text?.trim() || '';
                const parsedReply = parseReplyFromJsonText(candidateText);

                if (parsedReply) {
                    return parsedReply;
                }

                throw new Error('Reply payload is empty');
            } catch (error) {
                lastError = error;

                if (!isRetryableError(error) || attempt >= MAX_API_RETRIES) {
                    break;
                }

                const jitter = Math.floor(Math.random() * 120);
                const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + jitter;
                await wait(delay);
            }
        }
    }

    throw lastError ?? new Error('Failed to generate tutor reply');
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    try {
        const body = (await request.json()) as TutorChatRequest;
        const question = sanitizeText(body.problemContext?.question);
        const answer = sanitizeText(body.problemContext?.answer, '（未設定）');
        const userAnswer = sanitizeText(body.problemContext?.userAnswer, '（未回答）');
        const explanation = sanitizeText(body.problemContext?.explanation, '（なし）');

        if (!question) {
            return NextResponse.json(
                { error: 'problemContext.question is required' },
                { status: 400 },
            );
        }

        const messages = sanitizeMessages(body.messages);
        if (messages.length === 0) {
            return NextResponse.json({ error: 'messages is required' }, { status: 400 });
        }

        const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
        if (!latestUserMessage) {
            return NextResponse.json({ error: 'latest user message is required' }, { status: 400 });
        }

        if (ACK_ONLY_REGEX.test(latestUserMessage)) {
            return NextResponse.json({
                reply: 'いいですね。次はどこを確認しましょうか？短く聞いてくれれば、すぐ一緒に考えます。',
            });
        }

        const translationMode = TRANSLATION_HINT_REGEX.test(latestUserMessage);
        const transcript = formatTranscript(messages);
        const prompt = buildTutorPrompt({
            question,
            answer,
            userAnswer,
            explanation,
            transcript,
            latestUserMessage,
            translationMode,
        });

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        let reply = await generateTutorReply({ ai, prompt });

        if (isUnnaturalReply(reply)) {
            reply = buildFallbackReply(latestUserMessage, translationMode);
        }

        return NextResponse.json({ reply: normalizeTutorReply(reply) });
    } catch (error) {
        console.error('[TutorChat] Failed:', error);
        return NextResponse.json({ error: 'Failed to generate tutor response' }, { status: 500 });
    }
}
