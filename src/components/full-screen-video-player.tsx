"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import YouTube from "react-youtube";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight } from "lucide-react";
import { getYouTubeId, getEmbedUrl } from '@/lib/youtube';

export interface VideoData {
    title: string;          // Used for display
    url: string;            // YouTube URL
    id?: string;            // Optional identifier (e.g., historyId)
}

interface FullScreenVideoPlayerProps {
    isOpen: boolean;
    onClose: () => void;

    // Video Data
    playlist: VideoData[]; // Can be single item array
    initialIndex?: number;

    // Callbacks
    onVideoEnd?: (video: VideoData, index: number) => void;
    onNext?: (currentIndex: number, nextIndex: number) => void;

    // UI Options
    autoCloseOnLastVideoEnd?: boolean;
    showNextButton?: boolean; // If true, shows explicit "Next" button. If false, maybe auto-advance or just close.
    nextButtonLabel?: string;
    closeButtonLabel?: string;
}

export function FullScreenVideoPlayer({
    isOpen,
    onClose,
    playlist,
    initialIndex = 0,
    onVideoEnd,
    onNext,
    autoCloseOnLastVideoEnd = false,
    showNextButton = true,
    nextButtonLabel = "次の動画へ",
    closeButtonLabel = "閉じる",
}: FullScreenVideoPlayerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
        }
    }, [isOpen, initialIndex]);

    if (!playlist || playlist.length === 0) return null;

    const currentVideo = playlist[currentIndex];
    const youTubeId = getYouTubeId(currentVideo.url);
    const embedUrl = getEmbedUrl(currentVideo.url);

    const isLastVideo = currentIndex >= playlist.length - 1;

    const handleNext = () => {
        if (!isLastVideo) {
            const nextIndex = currentIndex + 1;
            if (onNext) {
                onNext(currentIndex, nextIndex);
            }
            setCurrentIndex(nextIndex);
        } else {
            onClose();
        }
    };

    const handleVideoEnd = () => {
        // Notify parent
        if (onVideoEnd) {
            onVideoEnd(currentVideo, currentIndex);
        }

        // Auto Advance logic could go here if we want it automatic
        // For now, let's keep it manual or based on props, but existing logic often auto-advances.
        // Let's implement auto-advance for playlist if it's not the last one.
        if (!isLastVideo) {
            handleNext();
        } else if (autoCloseOnLastVideoEnd) {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent showCloseButton={false} className="!max-w-none w-screen h-screen p-0 m-0 gap-0 bg-black border-none flex flex-col justify-center items-center duration-0">
                <DialogHeader className="absolute top-4 left-4 right-4 z-10 bg-black/50 p-2 rounded text-white overflow-hidden flex flex-row justify-between items-start pointer-events-none">
                    <div className="flex flex-col overflow-hidden mr-2">
                        <DialogTitle className="text-white truncate text-left">{currentVideo.title}</DialogTitle>
                        <DialogDescription className="text-gray-300 text-left">
                            {playlist.length > 1 ? `${currentIndex + 1} / ${playlist.length}` : "動画を見て理解を深めましょう。"}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 w-full h-full bg-black flex items-center justify-center">
                    {youTubeId ? (
                        <YouTube
                            key={currentVideo.url} // Force re-render on video change
                            videoId={youTubeId}
                            className="w-full h-full"
                            iframeClassName="w-full h-full"
                            opts={{
                                width: '100%',
                                height: '100%',
                                playerVars: {
                                    autoplay: 1,
                                    rel: 0,
                                    playsinline: 1,
                                },
                            }}
                            onReady={(event: any) => {
                                event.target.setPlaybackRate(1.25); // Set default speed to 1.25x as a reasonable default, or 1.0
                            }}
                            onEnd={handleVideoEnd}
                        />
                    ) : (
                        <iframe
                            src={embedUrl}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}
                </div>

                <DialogFooter className="absolute bottom-10 right-10 z-10">
                    {!isLastVideo && showNextButton ? (
                        <Button variant="default" onClick={handleNext} className="bg-white text-black hover:bg-gray-200 gap-2">
                            {nextButtonLabel} <ArrowRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button variant="secondary" onClick={onClose} className="bg-white/90 hover:bg-white text-black">
                            {closeButtonLabel}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
