import { X, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

type CallOverlayProps = {
    isOpen: boolean;
    onClose: () => void;
    onToggleMic: () => void;
    isMicMuted: boolean;
    isTalking: boolean; // Is AI talking?
    connectionState: ConnectionState;
};

export function CallOverlay({
    isOpen,
    onClose,
    onToggleMic,
    isMicMuted,
    isTalking,
    connectionState,
}: CallOverlayProps) {
    if (!isOpen) return null;

    return (
        <CallOverlayContent
            onClose={onClose}
            onToggleMic={onToggleMic}
            isMicMuted={isMicMuted}
            isTalking={isTalking}
            connectionState={connectionState}
        />
    );
}

function CallOverlayContent({
    onClose,
    onToggleMic,
    isMicMuted,
    isTalking,
    connectionState,
}: Omit<CallOverlayProps, 'isOpen'>) {
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setDuration((prev) => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const statusText = (() => {
        if (connectionState === 'disconnected') return '通話が切断されました';
        if (connectionState === 'connecting') return '接続中...';
        if (connectionState === 'error') return 'マイクまたは接続で問題が発生しました';
        if (isMicMuted) return 'マイクはオフです';
        if (isTalking) return 'お話し中...';
        return '聞き取り中...';
    })();

    const statusClassName = connectionState === 'disconnected'
        ? 'text-muted-foreground text-sm'
        : connectionState === 'error'
        ? 'text-red-500 font-medium'
        : connectionState === 'connecting'
            ? 'text-amber-500 font-medium animate-pulse'
            : isMicMuted
                ? 'text-amber-500 font-medium'
            : isTalking
                ? 'text-blue-500 font-medium animate-pulse'
                : 'text-muted-foreground text-sm';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-background w-full max-w-md p-6 rounded-lg shadow-xl flex flex-col items-center space-y-8 animate-in fade-in zoom-in duration-300">

                {/* Header */}
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">AI家庭教師と通話中</h2>
                    <p className="text-muted-foreground font-mono">{formatTime(duration)}</p>
                </div>

                {/* Visualizer Area */}
                <div className="relative h-32 w-32 flex items-center justify-center">
                    {/* AI Avatar / Visualizer Placeholder */}
                    <div className={`absolute inset-0 rounded-full bg-blue-500/20 animate-pulse ${isTalking ? 'scale-125 duration-700' : 'scale-100 duration-1000'}`}></div>
                    <div className={`absolute inset-4 rounded-full bg-blue-500/40 animate-pulse ${isTalking ? 'scale-110 duration-500 delay-75' : 'scale-100 duration-1000'}`}></div>
                    <div className="relative h-20 w-20 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/50">
                        <Mic className="h-8 w-8 text-white" />
                    </div>
                </div>

                {/* Text Status */}
                <div className="h-6">
                    <span className={statusClassName}>{statusText}</span>
                </div>

                {/* Controls */}
                <div className="flex items-center space-x-6">
                    <Button
                        variant="outline"
                        size="icon"
                        className={`h-12 w-12 rounded-full ${isMicMuted ? 'border-amber-400 bg-amber-50' : 'border-muted-foreground/20'}`}
                        onClick={onToggleMic}
                        disabled={connectionState !== 'connected'}
                        title={isMicMuted ? 'マイクをオンにする' : 'マイクをオフにする'}
                    >
                        {isMicMuted ? (
                            <MicOff className="h-5 w-5 text-amber-600" />
                        ) : (
                            <Mic className="h-5 w-5 text-muted-foreground" />
                        )}
                    </Button>

                    {/* End Call Button */}
                    <Button
                        variant="destructive"
                        size="icon"
                        className="h-16 w-16 rounded-full shadow-lg hover:bg-red-600 hover:scale-105 transition-all"
                        onClick={onClose}
                    >
                        <X className="h-8 w-8" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
