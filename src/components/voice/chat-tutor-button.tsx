"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    sanitizeTutorChatMessages,
    type TutorChatMessage,
    type TutorChatResponseBody,
} from '@/lib/tutor-chat';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

type ChatTutorButtonProps = {
    targetStudentId: string;
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    systemPrompt: string;
};

const INITIAL_ASSISTANT_MESSAGE = 'あなたのわからないところを教えてください。';
const STORAGE_NAMESPACE = 'chat-tutor:messages';
const MAX_STORED_MESSAGES = 40;

function toBase64Utf8(value: string) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return window.btoa(binary);
}

export function ChatTutorButton({ targetStudentId, problemContext, systemPrompt }: ChatTutorButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<TutorChatMessage[]>([
        { role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE },
    ]);
    const messagesViewportRef = useRef<HTMLDivElement | null>(null);
    const storageKey = useMemo(() => {
        const raw = [
            STORAGE_NAMESPACE,
            problemContext.question || '',
            problemContext.answer || '',
            problemContext.userAnswer || '',
        ].join('|');

        if (typeof window === 'undefined') {
            return raw;
        }

        return `${STORAGE_NAMESPACE}:${toBase64Utf8(raw)}`;
    }, [problemContext.answer, problemContext.question, problemContext.userAnswer]);

    const canSend = input.trim().length > 0 && !isLoading;

    const headerQuestion = useMemo(() => {
        const q = problemContext.question?.trim() || '';
        return q.length > 80 ? `${q.slice(0, 80)}...` : q;
    }, [problemContext.question]);

    useEffect(() => {
        if (!isOpen) return;
        const viewport = messagesViewportRef.current;
        if (!viewport) return;
        viewport.scrollTop = viewport.scrollHeight;
    }, [isOpen, messages, isLoading]);

    useEffect(() => {
        const stored = window.sessionStorage.getItem(storageKey);
        if (!stored) {
            setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }]);
            return;
        }

        try {
            const parsed = JSON.parse(stored) as unknown;
            if (!Array.isArray(parsed)) {
                setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }]);
                return;
            }

            const sanitized = sanitizeTutorChatMessages(parsed, {
                maxHistoryMessages: MAX_STORED_MESSAGES,
                maxMessageChars: 1000,
            });
            if (sanitized.length === 0) {
                setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }]);
                return;
            }

            setMessages(sanitized);
        } catch {
            setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }]);
        }
    }, [storageKey]);

    useEffect(() => {
        if (messages.length === 0) return;
        window.sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    }, [messages, storageKey]);

    const sendMessage = async () => {
        const userText = input.trim();
        if (!userText || isLoading) return;

        const nextMessages: TutorChatMessage[] = [...messages, { role: 'user', content: userText }];
        setMessages(nextMessages);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/tutor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    targetStudentId,
                    problemContext,
                    messages: nextMessages,
                }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = (await res.json()) as TutorChatResponseBody;
            const reply = data.reply?.trim();
            if (!reply) {
                throw new Error('Empty reply');
            }

            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: reply,
                modelContent: data.modelContent,
            }]);
        } catch (error) {
            console.error('[ChatTutor] Failed to send message:', error);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'ごめんなさい、応答に失敗しました。もう一度送ってみてください。',
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    title="AI先生にチャットで相談する"
                >
                    <MessageCircle className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-3 border-b">
                    <DialogTitle>AI家庭教師にチャット相談</DialogTitle>
                    <DialogDescription className="line-clamp-2">
                        {headerQuestion}
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4">
                    <div
                        ref={messagesViewportRef}
                        className="h-[340px] overflow-y-auto rounded-md border bg-muted/20 p-4 space-y-3"
                    >
                        {messages.map((message, index) => (
                            <div
                                key={`${message.role}-${index}`}
                                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                            >
                                <div
                                    className={
                                        message.role === 'user'
                                            ? 'max-w-[80%] rounded-lg bg-blue-600 text-white px-3 py-2 text-sm whitespace-pre-wrap'
                                            : 'max-w-[80%] rounded-lg bg-white border px-3 py-2 text-sm whitespace-pre-wrap'
                                    }
                                >
                                    {message.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-[80%] rounded-lg bg-white border px-3 py-2 text-sm flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    考え中...
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-end gap-2">
                        <Textarea
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void sendMessage();
                                }
                            }}
                            placeholder="わからないところを入力してください（Enterで送信、Shift+Enterで改行）"
                            className="min-h-20"
                            disabled={isLoading}
                        />
                        <Button onClick={() => void sendMessage()} disabled={!canSend} className="h-10 shrink-0">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
