"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Printer, ArrowLeft, PlayCircle, Video as VideoIcon, Lock } from "lucide-react";
import Link from "next/link";
import YouTube from "react-youtube";
import { CoreProblem, Subject } from "@prisma/client";

interface VideoData {
    title: string;
    url: string;
}

interface UnitFocusDetailClientProps {
    coreProblem: CoreProblem & { subject: Subject };
    lectureVideos: VideoData[];
    isUnlocked: boolean;
}

export function UnitFocusDetailClient({ coreProblem, lectureVideos, isUnlocked }: UnitFocusDetailClientProps) {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

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

    // Lock screen removed as per requirement to allow printing for all units.
    /*
    if (!isUnlocked) {
        return (
            <div className="container mx-auto px-4 py-12 text-center">
               ...
            </div>
        );
    }
    */

    const currentVideo = lectureVideos[currentVideoIndex];
    const youTubeId = currentVideo ? getYouTubeId(currentVideo.url) : null;

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <Button variant="ghost" asChild className="mb-6 pl-0 hover:bg-transparent hover:text-primary">
                <Link href="/unit-focus" className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    単元一覧に戻る
                </Link>
            </Button>

            <div className="mb-8">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <span className="text-sm font-medium px-2 py-0.5 rounded bg-muted">
                        {coreProblem.subject.name}
                    </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{coreProblem.name}</h1>
            </div>

            <div className="grid gap-8">
                {/* 1. Video Section */}
                <section>
                    <Card className="overflow-hidden border-2 border-primary/10 shadow-lg">
                        <CardHeader className="bg-muted/30 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <PlayCircle className="w-5 h-5 text-blue-600" />
                                講義動画を視聴
                            </CardTitle>
                            <CardDescription>
                                ポイントを動画で確認して理解を深めましょう
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {lectureVideos.length > 0 ? (
                                <div>
                                    <div className="aspect-video bg-black w-full">
                                        {youTubeId ? (
                                            <YouTube
                                                videoId={youTubeId}
                                                className="w-full h-full"
                                                iframeClassName="w-full h-full"
                                                opts={{
                                                    width: '100%',
                                                    height: '100%',
                                                    playerVars: {
                                                        autoplay: 0,
                                                        rel: 0,
                                                        modestbranding: 1,
                                                    },
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white">
                                                <p>動画の読み込みに失敗しました。</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Video List / Selector if multiple */}
                                    {lectureVideos.length > 1 && (
                                        <div className="border-t p-4 bg-muted/20">
                                            <p className="text-sm font-medium mb-2 text-muted-foreground">動画リスト:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {lectureVideos.map((video, idx) => (
                                                    <Button
                                                        key={idx}
                                                        variant={currentVideoIndex === idx ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setCurrentVideoIndex(idx)}
                                                        className="text-xs gap-2"
                                                    >
                                                        <VideoIcon className="w-3 h-3" />
                                                        {video.title || `動画 ${idx + 1}`}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="p-4 bg-white">
                                        <h3 className="font-semibold text-lg mb-1">{currentVideo?.title}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            動画を見て重要なポイントを確認しましょう。
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-12 text-center text-muted-foreground bg-muted/10">
                                    <VideoIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>この単元には講義動画が設定されていません。</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </section>

                {/* 2. Print Section */}
                <section>
                    <Card className="border-2 border-primary/20 bg-primary/5 shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Printer className="w-6 h-6 text-primary" />
                                問題を印刷する
                            </CardTitle>
                            <CardDescription>
                                この単元の問題を出題します
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                size="lg"
                                className="w-full sm:w-auto text-lg py-6 gap-3 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                asChild
                            >
                                <Link href={`/dashboard/print?subjectId=${coreProblem.subjectId}&coreProblemId=${coreProblem.id}`}>
                                    <Printer className="w-5 h-5" />
                                    今すぐ問題を印刷する
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
