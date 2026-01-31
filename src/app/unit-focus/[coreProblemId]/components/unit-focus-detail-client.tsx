"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Printer, ArrowLeft, PlayCircle, Video as VideoIcon, Lock } from "lucide-react";
import Link from "next/link";
import { FullScreenVideoPlayer } from "@/components/full-screen-video-player";
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
    const [isVideoOpen, setIsVideoOpen] = useState(false);
    const [startIndex, setStartIndex] = useState(0);

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
                                <div className="p-6">
                                    {/* Main Play Button (starts from beginning) */}
                                    <div className="aspect-video bg-black/5 w-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 mb-4 group cursor-pointer hover:bg-black/10 transition-colors"
                                        onClick={() => {
                                            setStartIndex(0);
                                            setIsVideoOpen(true);
                                        }}>
                                        <PlayCircle className="w-16 h-16 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                                        <p className="font-semibold text-lg text-blue-700">再生する</p>
                                        <p className="text-sm text-muted-foreground">{lectureVideos[0].title}</p>
                                    </div>

                                    <Button
                                        className="w-full text-lg py-6 gap-2 mb-4"
                                        size="lg"
                                        onClick={() => {
                                            setStartIndex(0);
                                            setIsVideoOpen(true);
                                        }}
                                    >
                                        <PlayCircle className="w-6 h-6" />
                                        講義動画を見る {lectureVideos.length > 1 && `(${lectureVideos.length})`}
                                    </Button>

                                    {/* Individual Video Selection List */}
                                    {lectureVideos.length > 1 && (
                                        <div className="border-t pt-4 mt-2">
                                            <p className="text-sm font-medium mb-3 text-muted-foreground">動画を選んで再生:</p>
                                            <div className="space-y-2">
                                                {lectureVideos.map((video, idx) => (
                                                    <Button
                                                        key={idx}
                                                        variant="outline"
                                                        className="w-full justify-start h-auto py-3 px-4 text-left font-normal hover:bg-muted/50"
                                                        onClick={() => {
                                                            setStartIndex(idx);
                                                            setIsVideoOpen(true);
                                                        }}
                                                    >
                                                        <VideoIcon className="w-4 h-4 mr-3 flex-shrink-0 text-muted-foreground" />
                                                        <span className="truncate">{video.title || `講義動画 ${idx + 1}`}</span>
                                                        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                            No. {idx + 1}
                                                        </span>
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <FullScreenVideoPlayer
                                        isOpen={isVideoOpen}
                                        onClose={() => setIsVideoOpen(false)}
                                        initialIndex={startIndex}
                                        playlist={lectureVideos.map(v => ({
                                            title: v.title || coreProblem.name,
                                            url: v.url
                                        }))}
                                    />
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
