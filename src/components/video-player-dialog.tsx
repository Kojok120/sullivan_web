
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { PlayCircle, CheckCircle } from "lucide-react";
import { markVideoWatched } from "@/app/actions";
import { useRouter } from "next/navigation";

interface VideoPlayerDialogProps {
    videoUrl: string;
    historyId: string;
    isWatched: boolean;
    isRequired: boolean;
}

export function VideoPlayerDialog({
    videoUrl,
    historyId,
    isWatched,
    isRequired,
}: VideoPlayerDialogProps) {
    const [open, setOpen] = useState(false);
    const [watched, setWatched] = useState(isWatched);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleMarkWatched = async () => {
        setLoading(true);
        try {
            await markVideoWatched(historyId);
            setWatched(true);
            router.refresh();
            // Optionally close dialog or keep open
            setOpen(false);
        } catch (error) {
            console.error("Failed to mark watched", error);
        } finally {
            setLoading(false);
        }
    };

    // Convert YouTube URL to Embed if needed (Quick Fix)
    // Assuming videoUrl might be "https://youtu.be/..." or "https://www.youtube.com/watch?v=..."
    // or direct file.
    // For safety, let's just render it in an iframe if it looks like a link, or video tag.
    // MVP: Just iframe specific logic or generic link.

    const getEmbedUrl = (url: string) => {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            let videoId = '';
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop()?.split('?')[0] || '';
            } else {
                const urlParams = new URLSearchParams(new URL(url).search);
                videoId = urlParams.get('v') || '';
            }
            return `https://www.youtube.com/embed/${videoId}`;
        }
        return url;
    };

    const embedUrl = getEmbedUrl(videoUrl);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={isRequired && !watched ? "destructive" : "outline"}
                    className="gap-2"
                >
                    <PlayCircle className="h-4 w-4" />
                    {watched ? "復習する" : "解説動画を見る"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>解説動画</DialogTitle>
                    <DialogDescription>
                        動画を見て理解を深めましょう。
                    </DialogDescription>
                </DialogHeader>

                <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                    <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>

                <DialogFooter className="sm:justify-between items-center">
                    <div className="text-sm text-muted-foreground">
                        {isRequired && !watched && "※視聴完了ボタンを必ず押してください"}
                    </div>
                    {!watched ? (
                        <Button onClick={handleMarkWatched} disabled={loading} className="gap-2">
                            <CheckCircle className="h-4 w-4" />
                            視聴を完了する
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={() => setOpen(false)}>閉じる</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
