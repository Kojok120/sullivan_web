"use client";

import { useEffect, useState } from "react";
import YouTube, { YouTubeEvent } from "react-youtube";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
        stopTracking,
        resetTracking,
        registerPlayer,
        handlePlaybackRateChange,
        handleStateChange,
        changeSpeed,
        seekRelative,
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
        stopTracking();
        onVideoEnd?.(currentVideo, currentIndex);

        if (!isLastVideo) {
            moveNext();
            return;
        }

        if (autoCloseOnLastVideoEnd) {
            closePlayer();
        }
    };

    return (
        <DialogContent showCloseButton={false} className="!max-w-none w-screen h-screen p-0 m-0 gap-0 bg-black border-none flex flex-col justify-center items-center duration-0">
            <DialogHeader className="absolute top-4 left-4 right-4 z-10 bg-black/50 p-2 rounded text-white overflow-hidden flex flex-row justify-between items-start pointer-events-none">
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
                        onReady={(event: YouTubeEvent) => registerPlayer(event.target)}
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
                <div className="absolute bottom-0 right-0 w-40 h-16 z-[5]" style={{ pointerEvents: "auto" }} />
                {videoEnded && (
                    <div className="absolute inset-0 z-[6] bg-black flex items-center justify-center">
                        <div className="text-white/60 text-lg">動画の再生が完了しました</div>
                    </div>
                )}
            </div>

            {!videoEnded && (
                <div className="absolute bottom-10 left-10 z-10 flex items-center gap-1">
                    {youTubeId && (
                        <button
                            onClick={() => seekRelative(-10)}
                            className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-white/20 text-white/80 hover:bg-white/30 flex items-center gap-1"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            10秒戻す
                        </button>
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

            <DialogFooter className="absolute bottom-10 right-10 z-10">
                {showButton ? (
                    isLastVideo ? (
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={replayCurrentVideo} className="bg-white/90 hover:bg-white text-black">
                                もう一度再生
                            </Button>
                            <Button variant="secondary" onClick={closePlayer} className="bg-white/90 hover:bg-white text-black">
                                {closeButtonLabel}
                            </Button>
                        </div>
                    ) : showNextButton ? (
                        <Button
                            variant="default"
                            onClick={moveNext}
                            className="bg-white text-black hover:bg-gray-200 gap-2"
                        >
                            {nextButtonLabel} <ArrowRight className="h-4 w-4" />
                        </Button>
                    ) : null
                ) : (
                    <div className="text-white/70 text-sm bg-black/50 px-4 py-2 rounded-lg">
                        動画を最後まで視聴してください
                    </div>
                )}
            </DialogFooter>
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
