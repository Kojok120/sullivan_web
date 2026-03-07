import { describe, expect, it } from 'vitest';

import {
    buildTutorChatHistory,
    extractTutorChatModelContent,
    normalizeTutorChatModelContentForHistory,
    sanitizeTutorChatMessages,
} from '@/lib/tutor-chat';

describe('tutor-chat helpers', () => {
    it('旧形式メッセージを後方互換で sanitize できる', () => {
        const messages = sanitizeTutorChatMessages([
            { role: 'assistant', content: 'こんにちは' },
            { role: 'user', content: '  質問です  ' },
        ], {
            maxHistoryMessages: 12,
            maxMessageChars: 1000,
        });

        expect(messages).toEqual([
            { role: 'assistant', content: 'こんにちは', modelContent: undefined },
            { role: 'user', content: '質問です' },
        ]);
    });

    it('assistant の modelContent を保持し、履歴では先頭 assistant を除外する', () => {
        const messages = sanitizeTutorChatMessages([
            { role: 'assistant', content: '最初の案内' },
            { role: 'user', content: '一次方程式がわかりません' },
            {
                role: 'assistant',
                content: 'xを孤立させます。',
                modelContent: {
                    role: 'model',
                    parts: [
                        { thought: true, thoughtSignature: 'sig-1' },
                        { text: '{"reply":"xを孤立させます。"}' },
                    ],
                },
            },
        ], {
            maxHistoryMessages: 12,
            maxMessageChars: 1000,
        });

        const history = buildTutorChatHistory(messages);

        expect(history).toEqual([
            {
                role: 'user',
                parts: [{ text: '一次方程式がわかりません' }],
            },
            {
                role: 'model',
                parts: [
                    { thought: true, thoughtSignature: 'sig-1' },
                    { text: '{"reply":"xを孤立させます。"}' },
                ],
            },
        ]);
    });

    it('壊れた modelContent は text fallback に落とす', () => {
        const messages = sanitizeTutorChatMessages([
            { role: 'user', content: '質問' },
            {
                role: 'assistant',
                content: '返答',
                modelContent: {
                    role: 'assistant',
                    parts: [{ text: 'invalid' }],
                },
            },
        ], {
            maxHistoryMessages: 12,
            maxMessageChars: 1000,
        });

        const history = buildTutorChatHistory(messages);

        expect(history).toEqual([
            { role: 'user', parts: [{ text: '質問' }] },
            { role: 'model', parts: [{ text: '返答' }] },
        ]);
    });

    it('レスポンスから modelContent を抽出する', () => {
        const modelContent = extractTutorChatModelContent({
            candidates: [
                {
                    content: {
                        role: 'model',
                        parts: [
                            { thought: true, thoughtSignature: 'sig-2' },
                            { text: '{"reply":"答えです。"}' },
                            { inlineData: { data: 'ignored', mimeType: 'text/plain' } },
                        ],
                    },
                },
            ],
        } as never);

        expect(modelContent).toEqual({
            role: 'model',
            parts: [
                { thought: true, thoughtSignature: 'sig-2' },
                { text: '{"reply":"答えです。"}' },
            ],
        });
    });

    it('履歴保存用には JSON text を自然文の reply に置き換える', () => {
        const modelContent = normalizeTutorChatModelContentForHistory({
            role: 'model',
            parts: [
                { thought: true, thoughtSignature: 'sig-3' },
                { text: '{"reply":"分配法則を使います。"}' },
            ],
        }, '分配法則を使います。');

        expect(modelContent).toEqual({
            role: 'model',
            parts: [
                { thought: true, thoughtSignature: 'sig-3' },
                { text: '分配法則を使います。' },
            ],
        });
    });
});
