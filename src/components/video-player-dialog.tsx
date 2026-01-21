
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import YouTube from "react-youtube";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { PlayCircle, CheckCircle, ArrowRight } from "lucide-react";
import { markVideoWatched } from "@/app/actions";
import { useRouter } from "next/navigation";

interface VideoItem {
    historyId: string;
    videoUrl: string;
    question: string;
}

interface VideoPlayerDialogProps {
    videoUrl: string;
    historyId: string;
    isWatched: boolean;
    isRequired: boolean;
    playlist?: VideoItem[];
}

export function VideoPlayerDialog({
    videoUrl: initialVideoUrl,
    historyId: initialHistoryId,
    isWatched: initialIsWatched,
    isRequired,
    playlist = [],
}: VideoPlayerDialogProps) {
    const [open, setOpen] = useState(false);

    // Determine start index in playlist if applicable
    const initialIndex = playlist.findIndex(p => p.historyId === initialHistoryId);
    const [currentIndex, setCurrentIndex] = useState(initialIndex !== -1 ? initialIndex : 0);

    // Current video state derived from index if playlist exists, otherwise props
    const currentVideo = playlist.length > 0
        ? playlist[currentIndex]
        : { historyId: initialHistoryId, videoUrl: initialVideoUrl, question: "" };

    const [watched, setWatched] = useState(initialIsWatched);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Sync watched state when prop changes (e.g., after router.refresh())
    useEffect(() => {
        setWatched(initialIsWatched);
    }, [initialIsWatched]);

    // Reset index when opening specific video
    const handleOpenChange = (newOpen: boolean) => {
        if (newOpen && playlist.length > 0 && initialIndex !== -1) {
            setCurrentIndex(initialIndex);
        }
        setOpen(newOpen);
    };

    const markCurrentWatched = async () => {
        // Optimistically update local state if single video or keeping track
        setWatched(true);
        try {
            await markVideoWatched(currentVideo.historyId);
            router.refresh();
        } catch (error) {
            console.error("Failed to mark watched", error);
        }
    };

    // Fire-and-forget version that doesn't refresh (for playlist navigation)
    const markWatchedSilent = (historyId: string) => {
        markVideoWatched(historyId).catch(console.error);
    };

    const handleNextVideo = () => {
        // Capture the current video's historyId before we change index
        const historyIdToMark = currentVideo.historyId;

        // Update index FIRST (synchronously) - this is the critical fix
        if (playlist.length > 0 && currentIndex < playlist.length - 1) {
            const newIndex = currentIndex + 1;
            setCurrentIndex(newIndex);
        }

        // Then fire-and-forget the watched marking (no router.refresh!)
        markWatchedSilent(historyIdToMark);
    };

    const handleVideoEnd = () => {
        // Auto-advance logic
        if (playlist.length > 0 && currentIndex < playlist.length - 1) {
            handleNextVideo();
        } else {
            // Last video finished - mark it watched silently
            markWatchedSilent(currentVideo.historyId);
        }
    };

    const handleMarkWatched = async () => {
        setLoading(true);
        try {
            await markCurrentWatched();
            setOpen(false);
        } finally {
            setLoading(false);
        }
    };

    // Convert YouTube URL to Embed if needed (Quick Fix)
    // Assuming videoUrl might be "https://youtu.be/..." or "https://www.youtube.com/watch?v=..."
    // or direct file.

    const getYouTubeId = (url: string) => {
        if (!url) return null;
        if (url.includes('youtu.be')) {
            return url.split('/').pop()?.split('?')[0] || null;
        }
        if (url.includes('youtube.com')) {
            const urlParams = new URLSearchParams(new URL(url).search);
            return urlParams.get('v') || null;
        }
        return null;
    };

    const youTubeId = getYouTubeId(currentVideo.videoUrl);

    // Fallback for non-youtube URLs (original logic sort of)
    const getEmbedUrl = (url: string) => {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const id = getYouTubeId(url);
            return `https://www.youtube.com/embed/${id}`;
        }
        return url;
    };

    // Only used if not using react-youtube component (fallback)
    const embedUrl = getEmbedUrl(currentVideo.videoUrl);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    variant={isRequired && !watched ? "destructive" : "outline"}
                    className="gap-2"
                >
                    <PlayCircle className="h-4 w-4" />
                    {watched ? "復習する" : "解説動画を見る"}
                </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="!max-w-none w-screen h-screen p-0 m-0 gap-0 bg-black border-none flex flex-col justify-center items-center duration-0">
                <DialogHeader className="absolute top-4 left-4 right-4 z-10 bg-black/50 p-2 rounded text-white overflow-hidden flex flex-row justify-between items-start pointer-events-none">
                    <div className="flex flex-col overflow-hidden mr-2">
                        <DialogTitle className="text-white truncate text-left">{currentVideo.question || "解説動画"}</DialogTitle>
                        <DialogDescription className="text-gray-300 text-left">
                            {playlist.length > 0 ? `${currentIndex + 1} / ${playlist.length}` : "動画を見て理解を深めましょう。"}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 w-full h-full bg-black flex items-center justify-center">
                    {youTubeId ? (
                        <YouTube
                            key={currentVideo.historyId}
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
                                event.target.setPlaybackRate(1.4);
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
                    {playlist.length > 0 && currentIndex < playlist.length - 1 ? (
                        <Button variant="default" onClick={handleNextVideo} className="bg-white text-black hover:bg-gray-200 gap-2">
                            次の動画へ <ArrowRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button variant="secondary" onClick={handleMarkWatched} className="bg-white/90 hover:bg-white text-black">
                            閉じる
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
