"use client";

import { useEffect, useState } from "react";
import YouTube, { YouTubeEvent } from "react-youtube";
import { ArrowLeft, Loader2, RotateCcw, SkipForward, X } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { getEmbedUrl, getYouTubeId } from "@/lib/youtube";
import { useYouTubePlaybackGuard } from "@/hooks/use-youtube-playback-guard";

export interface VideoData {
    title: string;
    url: string;
    id?: string;
}

interface FullScreenVideoPlayerProps {
    isOpen: boolean;
    onClose: () => void;
    playlist: VideoData[];
    initialIndex?: number;
    onVideoEnd?: (video: VideoData, index: number) => void;
    onNext?: (currentIndex: number, nextIndex: number) => void;
    autoCloseOnLastVideoEnd?: boolean;
    showNextButton?: boolean;
    nextButtonLabel?: string;
    closeButtonLabel?: string;
}

type PlayerContentProps = Omit<FullScreenVideoPlayerProps, 'isOpen'>;

function formatVideoTime(totalSeconds: number) {
    const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0
        ? Math.floor(totalSeconds)
        : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function FullScreenVideoPlayerContent({
    onClose,
    playlist,
    initialIndex = 0,
    onVideoEnd,
    onNext,
    autoCloseOnLastVideoEnd = false,
    showNextButton = true,
    nextButtonLabel = "次の動画へ",
    closeButtonLabel = "閉じる",
}: PlayerContentProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [videoEnded, setVideoEnded] = useState(false);
    const [showButton, setShowButton] = useState(false);
    const [instanceKey, setInstanceKey] = useState(0);
    const {
        allowedRates,
        currentRate,
        currentTimeSeconds,
        durationSeconds,
        progressPercent,
        stopTracking,
        resetTracking,
        registerPlayer,
        handlePlaybackRateChange,
        handleStateChange,
        changeSpeed,
        seekRelative,
        markPlaybackCompleted,
    } = useYouTubePlaybackGuard();

    useEffect(() => {
        if (!videoEnded) {
            return;
        }
        const timer = setTimeout(() => setShowButton(true), 2000);
        return () => clearTimeout(timer);
    }, [videoEnded]);

    useEffect(() => () => stopTracking(), [stopTracking]);

    if (!playlist || playlist.length === 0) {
        return null;
    }

    const currentVideo = playlist[currentIndex];
    const youTubeId = getYouTubeId(currentVideo.url);
    const embedUrl = getEmbedUrl(currentVideo.url);
    const isLastVideo = currentIndex >= playlist.length - 1;

    const closePlayer = () => {
        resetTracking();
        onClose();
    };

    const moveNext = () => {
        if (isLastVideo) {
            closePlayer();
            return;
        }

        const nextIndex = currentIndex + 1;
        onNext?.(currentIndex, nextIndex);
        setCurrentIndex(nextIndex);
        setVideoEnded(false);
        setShowButton(false);
        setInstanceKey((prev) => prev + 1);
        resetTracking();
    };

    const replayCurrentVideo = () => {
        setVideoEnded(false);
        setShowButton(false);
        setInstanceKey((prev) => prev + 1);
        resetTracking();
    };

    const handleVideoEnd = () => {
        setVideoEnded(true);
        markPlaybackCompleted();
        stopTracking();
        onVideoEnd?.(currentVideo, currentIndex);

        if (autoCloseOnLastVideoEnd && isLastVideo) {
            closePlayer();
        }
    };

    return (
        <DialogContent showCloseButton={false} className="!max-w-none w-screen h-screen p-0 m-0 gap-0 bg-black border-none flex flex-col justify-center items-center duration-0">
            <Button
                type="button"
                onClick={closePlayer}
                aria-label="戻る"
                title="戻る"
                className="absolute top-4 left-4 z-[7] h-10 px-3 bg-black/60 text-white hover:bg-black/75 border border-white/20"
            >
                <ArrowLeft className="h-4 w-4 mr-1" />
                戻る
            </Button>
            <DialogHeader className="absolute top-4 left-20 right-4 z-10 bg-black/50 p-2 rounded text-white overflow-hidden flex flex-row justify-between items-start pointer-events-none">
                <div className="flex flex-col overflow-hidden mr-2">
                    <DialogTitle className="text-white truncate text-left">{currentVideo.title}</DialogTitle>
                    <DialogDescription className="text-gray-300 text-left">
                        {playlist.length > 1 ? `${currentIndex + 1} / ${playlist.length}` : "動画を見て理解を深めましょう。"}
                    </DialogDescription>
                </div>
            </DialogHeader>

            <div className="flex-1 w-full h-full bg-black flex items-center justify-center relative">
                {youTubeId ? (
                    <YouTube
                        key={`${currentVideo.url}-${instanceKey}`}
                        videoId={youTubeId}
                        className="w-full h-full"
                        iframeClassName="w-full h-full"
                        opts={{
                            width: "100%",
                            height: "100%",
                            playerVars: {
                                autoplay: 1,
                                rel: 0,
                                disablekb: 1,
                                controls: 0,
                                fs: 0,
                                iv_load_policy: 3,
                                playsinline: 1,
                            },
                        }}
                        onReady={(event: YouTubeEvent) => registerPlayer(event.target, { captureDuration: true })}
                        onEnd={handleVideoEnd}
                        onPlaybackRateChange={handlePlaybackRateChange}
                        onStateChange={handleStateChange}
                    />
                ) : (
                    <iframe
                        key={`${currentVideo.url}-${instanceKey}`}
                        src={embedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                )}
                {/* YouTubeタイトルリンクなど上部クリック領域をブロック */}
                <div aria-hidden="true" className="absolute top-0 inset-x-0 h-24 z-[4]" style={{ pointerEvents: "auto" }} />
                <div className="absolute inset-y-0 right-0 w-1/2 z-[4]" style={{ pointerEvents: "auto" }} />
                <div className="absolute bottom-0 right-0 w-40 h-16 z-[5]" style={{ pointerEvents: "auto" }} />
                {videoEnded && (
                    <div className="absolute inset-0 z-[6] bg-black">
                        {showButton ? (
                            <>
                                <Button
                                    type="button"
                                    onClick={replayCurrentVideo}
                                    aria-label="もう一度再生"
                                    title="もう一度再生"
                                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-white/90 text-black hover:bg-white transition-colors flex items-center justify-center shadow-lg"
                                >
                                    <RotateCcw className="h-9 w-9" />
                                </Button>
                                <Button
                                    type="button"
                                    onClick={!isLastVideo && showNextButton ? moveNext : closePlayer}
                                    aria-label={!isLastVideo && showNextButton ? nextButtonLabel : closeButtonLabel}
                                    title={!isLastVideo && showNextButton ? nextButtonLabel : closeButtonLabel}
                                    className="absolute bottom-8 right-8 h-14 w-14 rounded-full bg-white/90 text-black hover:bg-white transition-colors flex items-center justify-center shadow-lg"
                                >
                                    {!isLastVideo && showNextButton ? (
                                        <SkipForward className="h-7 w-7" />
                                    ) : (
                                        <X className="h-7 w-7" />
                                    )}
                                </Button>
                            </>
                        ) : (
                            <div
                                aria-live="polite"
                                aria-label="操作を表示しています"
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                >
                                    <Loader2 className="h-8 w-8 text-white/90" />
                                </motion.div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {youTubeId && (
                <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 w-[min(44rem,calc(100%-2rem))] -translate-x-1/2">
                    <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm">
                        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-white/80">
                            <span>再生進捗</span>
                            <span>{formatVideoTime(currentTimeSeconds)} / {formatVideoTime(durationSeconds)}</span>
                        </div>
                        <Progress
                            value={progressPercent}
                            aria-label="動画の再生進捗"
                            className="h-1.5 bg-white/20 [&_[data-slot=progress-indicator]]:bg-white"
                        />
                    </div>
                </div>
            )}

            {!videoEnded && (
                <div className="absolute bottom-24 left-10 z-10 flex items-center gap-1">
                    {youTubeId && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => seekRelative(-10)}
                            className="h-8 px-3 text-sm font-medium transition-colors bg-white/20 text-white/80 hover:bg-white/30 hover:text-white flex items-center gap-1"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            10秒戻す
                        </Button>
                    )}
                    {allowedRates.map((rate) => (
                        <button
                            key={rate}
                            onClick={() => changeSpeed(rate)}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${currentRate === rate
                                ? "bg-white text-black"
                                : "bg-white/20 text-white/70 hover:bg-white/30"
                                }`}
                        >
                            {rate}x
                        </button>
                    ))}
                </div>
            )}
        </DialogContent>
    );
}

export function FullScreenVideoPlayer({
    isOpen,
    onClose,
    ...props
}: FullScreenVideoPlayerProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            {isOpen ? <FullScreenVideoPlayerContent key={`player-${props.initialIndex ?? 0}-${props.playlist.length}`} onClose={onClose} {...props} /> : null}
        </Dialog>
    );
}
