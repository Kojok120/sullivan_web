"use client";

import { useState } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGeminiLive } from '@/hooks/use-gemini-live';
import { CallOverlay } from '@/components/voice/call-overlay';
import { toast } from 'sonner';

type PhoneTutorButtonProps = {
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    systemPrompt: string;
};

export function PhoneTutorButton({ problemContext, systemPrompt }: PhoneTutorButtonProps) {
    const { connect, disconnect, connectionState, isTalking, isMicMuted, toggleMic } = useGeminiLive();
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);

    const handleStartCall = () => {
        if (connectionState === 'connecting' || connectionState === 'connected') {
            return;
        }

        // Construct initial context message
        const initialContext = `
${systemPrompt}

---
【生徒が現在解いている問題】
問題: ${problemContext.question}
正解: ${problemContext.answer || '（未設定）'}
生徒の回答: ${problemContext.userAnswer || '（未回答）'}
解説: ${problemContext.explanation || '（なし）'}

家庭教師として、生徒の質問に答えてください。
話すスピードは通常より少し速め（目安1.1倍）で、テンポよく話してください。
まずは「あなたのわからないところを教えて」と優しく問いかけてください。
`;

        setIsOverlayOpen(true);
        void connect(initialContext).catch((error) => {
            console.error('[PhoneTutorButton] Failed to connect:', error);
            toast.error('通話の開始に失敗しました');
            setIsOverlayOpen(false);
        });
    };

    const handleEndCall = () => {
        disconnect();
        setIsOverlayOpen(false);
    };

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 relative group"
                onClick={handleStartCall}
                title="AI先生に電話する"
            >
                <div className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </div>
                <Phone className="h-5 w-5" />
            </Button>

            <CallOverlay
                isOpen={isOverlayOpen}
                onClose={handleEndCall}
                onToggleMic={toggleMic}
                isMicMuted={isMicMuted}
                isTalking={isTalking}
                connectionState={connectionState}
            />
        </>
    );
}
