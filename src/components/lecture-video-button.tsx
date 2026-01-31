"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GraduationCap } from 'lucide-react';
import { FullScreenVideoPlayer, VideoData } from './full-screen-video-player';

// 講義動画の型
interface LectureVideo {
    title: string;
    url: string;
}

interface LectureVideoButtonProps {
    videos: LectureVideo[];
    coreProblemName: string;
}

export function LectureVideoButton({ videos, coreProblemName }: LectureVideoButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (videos.length === 0) {
        return null;
    }

    const playlist: VideoData[] = videos.map(v => ({
        title: `${coreProblemName} - ${v.title}`,
        url: v.url
    }));

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={() => setIsOpen(true)}
            >
                <GraduationCap className="h-4 w-4 mr-2" />
                講義動画{videos.length > 1 ? ` (${videos.length})` : ''}
            </Button>

            <FullScreenVideoPlayer
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                playlist={playlist}
                autoCloseOnLastVideoEnd={false}
            />
        </>
    );
}
