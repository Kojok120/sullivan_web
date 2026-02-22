
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle } from "lucide-react";
import { markVideoWatched } from "@/app/actions";
import { useRouter } from "next/navigation";
import { FullScreenVideoPlayer, VideoData } from "./full-screen-video-player";

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
    const [watched, setWatched] = useState(initialIsWatched);
    const router = useRouter();

    // Sync watched state when prop changes
    useEffect(() => {
        setWatched(initialIsWatched);
    }, [initialIsWatched]);

    const handleMarkWatched = async (historyId: string) => {
        try {
            await markVideoWatched(historyId);
        } catch (error) {
            console.error("Failed to mark watched", error);
        }
    };

    // Prepare playlist for FullScreenVideoPlayer
    // Either from the playlist prop or a single item
    const playerPlaylist: VideoData[] = playlist.length > 0
        ? playlist.map(p => ({
            title: p.question,
            url: p.videoUrl,
            id: p.historyId
        }))
        : [{
            title: "解説動画",
            url: initialVideoUrl,
            id: initialHistoryId
        }];

    const initialIndex = playlist.length > 0
        ? playlist.findIndex(p => p.historyId === initialHistoryId)
        : 0;

    const handleVideoEnd = (video: VideoData) => {
        if (video.id) {
            handleMarkWatched(video.id);
        }
    };

    const handleClose = () => {
        setOpen(false);
        // Optimistically update
        setWatched(true);
        router.refresh();
    };

    return (
        <>
            <Button
                variant={isRequired && !watched ? "destructive" : "outline"}
                className="gap-2"
                onClick={() => setOpen(true)}
            >
                <PlayCircle className="h-4 w-4" />
                {watched ? "復習する" : "解説動画を見る"}
            </Button>

            <FullScreenVideoPlayer
                isOpen={open}
                onClose={handleClose}
                playlist={playerPlaylist}
                initialIndex={initialIndex !== -1 ? initialIndex : 0}
                onVideoEnd={handleVideoEnd}
            />
        </>
    );
}
