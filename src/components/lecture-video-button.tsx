'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { GraduationCap, ChevronLeft, ChevronRight } from 'lucide-react';
import YouTube from 'react-youtube';

// 講義動画の型
interface LectureVideo {
    title: string;
    url: string;
}

interface LectureVideoButtonProps {
    videos: LectureVideo[];
    coreProblemName: string;
}

import { getYouTubeId } from '@/lib/youtube';

export function LectureVideoButton({ videos, coreProblemName }: LectureVideoButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    if (videos.length === 0) {
        return null;
    }

    const currentVideo = videos[currentIndex];
    const youtubeId = getYouTubeId(currentVideo.url);

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : videos.length - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev < videos.length - 1 ? prev + 1 : 0));
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                >
                    <GraduationCap className="h-4 w-4 mr-2" />
                    講義動画{videos.length > 1 ? ` (${videos.length})` : ''}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-green-600" />
                        {coreProblemName} - {currentVideo.title}
                    </DialogTitle>
                    <DialogDescription>
                        この単元の学習内容を動画で確認しましょう
                        {videos.length > 1 && ` (${currentIndex + 1}/${videos.length})`}
                    </DialogDescription>
                </DialogHeader>

                {youtubeId && (
                    <div className="aspect-video w-full">
                        <YouTube
                            key={currentVideo.url} // キーを変更して再レンダリング
                            videoId={youtubeId}
                            opts={{
                                width: '100%',
                                height: '100%',
                                playerVars: {
                                    autoplay: 1,
                                },
                            }}
                            className="w-full h-full"
                        />
                    </div>
                )}

                {/* 動画が複数ある場合のナビゲーション */}
                {videos.length > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrev}
                            disabled={videos.length <= 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            前へ
                        </Button>
                        <div className="flex gap-2">
                            {videos.map((video, index) => (
                                <Button
                                    key={index}
                                    variant={index === currentIndex ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentIndex(index)}
                                    className="text-xs"
                                >
                                    {video.title}
                                </Button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNext}
                            disabled={videos.length <= 1}
                        >
                            次へ
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
