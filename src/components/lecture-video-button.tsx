"use client";

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { GraduationCap } from 'lucide-react';
import type { VideoData } from './full-screen-video-player';

// FullScreenVideoPlayer は framer-motion / react-youtube を pull-in するため、
// ボタンが押されて isOpen=true になったタイミングで初めて chunk を読み込む。
const FullScreenVideoPlayer = dynamic(
    () => import('./full-screen-video-player').then((mod) => mod.FullScreenVideoPlayer),
    { ssr: false },
);

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
    const t = useTranslations('LectureVideoButton');
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
                {videos.length > 1 ? t('labelWithCount', { count: videos.length }) : t('label')}
            </Button>

            {isOpen ? (
                <FullScreenVideoPlayer
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    playlist={playlist}
                    autoCloseOnLastVideoEnd={false}
                />
            ) : null}
        </>
    );
}
