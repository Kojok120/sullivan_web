"use client";

import { useState } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGeminiLive } from '@/hooks/use-gemini-live';
import { CallOverlay } from '@/components/voice/call-overlay';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

type PhoneTutorButtonProps = {
    targetStudentId: string;
    problemContext: {
        question: string;
        answer?: string;
        userAnswer?: string;
        explanation?: string;
    };
    systemPrompt: string;
};

export function PhoneTutorButton({ targetStudentId, problemContext, systemPrompt }: PhoneTutorButtonProps) {
    const t = useTranslations('PhoneTutorButton');
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
${t('currentProblemHeading')}
${t('questionLabel')}: ${problemContext.question}
${t('answerLabel')}: ${problemContext.answer || t('unset')}
${t('userAnswerLabel')}: ${problemContext.userAnswer || t('unanswered')}
${t('explanationLabel')}: ${problemContext.explanation || t('none')}

${t('instructionAnswer')}
${t('instructionSpeed')}
${t('instructionFirst')}
`;

        setIsOverlayOpen(true);
        void connect(initialContext, targetStudentId).catch((error) => {
            console.error('[PhoneTutorButton] Failed to connect:', error);
            toast.error(t('callStartFailed'));
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
                aria-label={t('title')}
                title={t('title')}
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
