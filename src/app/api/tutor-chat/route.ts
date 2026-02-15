import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSession } from '@/lib/auth';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type TutorChatRequest = {
    systemPrompt: string;
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    messages: ChatMessage[];
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGE_CHARS = 1000;
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 12;
const DANGLING_END_REGEX = /[、,:：;；]$/;
const INCOMPLETE_PHRASE_END_REGEX = /(まず|次に|そして|たとえば|例えば|つまり|なので|だから)$/;
const ACK_ONLY_REGEX = /^(なるほど|ありがとう|ありがとうございます|わかった|わかりました|了解|はい|うん|ok|OK|助かった|助かります)[。!！?？\s]*$/;
const TRANSLATION_HINT_REGEX = /(英語|英文|英訳|訳して|翻訳|英語で|translate|in english)/i;
const BAD_ENDING_REGEX = /(残りの|まず|次に|では|そして|たとえば|例えば)[。！？!?]?$/;

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function sanitizeText(value: unknown, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.trim();
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

function extractModelText(response: any): string {
    let reply = '';
    try {
        reply = typeof response?.text === 'function' ? response.text().trim() : '';
    } catch {
        reply = '';
    }

    if (reply) return reply;

    const firstCandidate = response?.candidates?.[0];
    const parts = firstCandidate?.content?.parts;
    if (!Array.isArray(parts)) return '';

    return parts
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('\n')
        .trim();
}

function getFinishReason(response: any): string {
    const reason = response?.candidates?.[0]?.finishReason;
    return typeof reason === 'string' ? reason : '';
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
        const systemPrompt = sanitizeText(body.systemPrompt);
        const question = sanitizeText(body.problemContext?.question);
        const answer = sanitizeText(body.problemContext?.answer, '（未設定）');
        const userAnswer = sanitizeText(body.problemContext?.userAnswer, '（未回答）');
        const explanation = sanitizeText(body.problemContext?.explanation, '（なし）');

        if (!systemPrompt || !question) {
            return NextResponse.json(
                { error: 'systemPrompt and problemContext.question are required' },
                { status: 400 }
            );
        }

        const messages = Array.isArray(body.messages)
            ? body.messages
                .filter((m): m is ChatMessage =>
                    (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string'
                )
                .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
                .filter((m) => m.content.length > 0)
                .slice(-MAX_HISTORY_MESSAGES)
            : [];

        if (messages.length === 0) {
            return NextResponse.json({ error: 'messages is required' }, { status: 400 });
        }

        const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
        if (ACK_ONLY_REGEX.test(latestUserMessage)) {
            return NextResponse.json({
                reply: 'いいですね。次はどこを確認しましょうか？短く聞いてくれれば、すぐ一緒に考えます。',
            });
        }

        const translationMode = TRANSLATION_HINT_REGEX.test(latestUserMessage);
        const transcript = formatTranscript(messages);
        const prompt = `
${systemPrompt}

---
【生徒が現在解いている問題】
問題: ${question}
正解: ${answer}
生徒の回答: ${userAnswer}
解説: ${explanation}

---
【ここまでの会話】
${transcript}

---
先生として、最後の「生徒」の発言に自然につながる次の返答を1つだけ返してください。
返答は日本語で、短め（2〜4文）にしてください。
${translationMode ? '生徒の質問は語句・短文の訳なので、最初の文で訳をはっきり示してください。' : '質問に対して結論を先に言い、必要なら短い補足を1つだけ入れてください。'}
返答は「結論 → 短い理由/補足 → 必要なら確認質問」の順にしてください。
文は途中で切らず、必ず完結させてください。語尾を「まず、」「次に、」などで終わらせないでください。
最後は「。」「？」「！」のいずれかで終えてください。
`;

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: CHAT_MODEL,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 512,
            },
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        let reply = extractModelText(response);
        const finishReason = getFinishReason(response);

        if (finishReason && finishReason !== 'STOP') {
            const regeneratePrompt = `
前回の返答は途中で切れました（finishReason: ${finishReason}）。
同じ内容を、最初から完結した自然な日本語2〜4文で出し直してください。
- 途中で切らない
- 最後は「。」「？」「！」で終える
- 生徒の直前発話: ${latestUserMessage}
- 途中で切れた返答: ${reply || '（空）'}
`;
            const regenerateResult = await model.generateContent(regeneratePrompt);
            const regenerated = extractModelText(regenerateResult.response);
            if (regenerated) {
                reply = regenerated;
            }
        }

        if (isUnnaturalReply(reply)) {
            const rewritePrompt = `
次の先生の返答を、意味を変えずに自然な日本語へ1〜3文で言い換えてください。
- 文を途中で切らない
- 「では、残りの。」のような不自然な終わり方をしない
- 最後は「。」「？」「！」で終える
- 生徒の直前発話: ${latestUserMessage}
- 元の返答: ${reply || '（空）'}
`;
            const rewriteResult = await model.generateContent(rewritePrompt);
            const rewritten = extractModelText(rewriteResult.response);
            if (rewritten) {
                reply = rewritten;
            }
        }

        if (isUnnaturalReply(reply)) {
            reply = buildFallbackReply(latestUserMessage, translationMode);
        }

        if (!reply) {
            console.warn('[TutorChat] Empty text response from Gemini', {
                model: CHAT_MODEL,
                promptFeedback: (response as any)?.promptFeedback,
                finishReason: getFinishReason(response),
            });
            return NextResponse.json({
                reply: 'うまく説明を作れませんでした。質問を少し短くして、もう一度送ってください。',
            });
        }

        return NextResponse.json({ reply: normalizeTutorReply(reply) });
    } catch (error) {
        console.error('[TutorChat] Failed:', error);
        return NextResponse.json({ error: 'Failed to generate tutor response' }, { status: 500 });
    }
}
