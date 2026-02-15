"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

type TutorMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type ChatTutorButtonProps = {
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    systemPrompt: string;
};

const INITIAL_ASSISTANT_MESSAGE = 'あなたのわからないところを教えてください。';

export function ChatTutorButton({ problemContext, systemPrompt }: ChatTutorButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<TutorMessage[]>([
        { role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE },
    ]);
    const messagesViewportRef = useRef<HTMLDivElement | null>(null);

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

    const sendMessage = async () => {
        const userText = input.trim();
        if (!userText || isLoading) return;

        const nextMessages: TutorMessage[] = [...messages, { role: 'user', content: userText }];
        setMessages(nextMessages);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/tutor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    problemContext,
                    messages: nextMessages,
                }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = (await res.json()) as { reply?: string };
            const reply = data.reply?.trim();
            if (!reply) {
                throw new Error('Empty reply');
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
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
