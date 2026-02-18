"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Printer, ArrowLeft, PlayCircle, Video as VideoIcon, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { FullScreenVideoPlayer } from "@/components/full-screen-video-player";
import { CoreProblem, Subject } from "@prisma/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { markLectureAsWatched } from '@/lib/api/lecture-watched-client';

interface VideoData {
    title: string;
    url: string;
}

interface UnitFocusDetailClientProps {
    coreProblem: CoreProblem & { subject: Subject };
    lectureVideos: VideoData[];
    isLectureWatched: boolean;
}

export function UnitFocusDetailClient({ coreProblem, lectureVideos, isLectureWatched }: UnitFocusDetailClientProps) {
    const router = useRouter();
    const [isVideoOpen, setIsVideoOpen] = useState(false);
    const [startIndex, setStartIndex] = useState(0);
    const [isWatched, setIsWatched] = useState(isLectureWatched);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [watchedCount, setWatchedCount] = useState(0);
    const totalVideos = lectureVideos.length;

    // 動画終了時のハンドラ
    const handleVideoEnd = async () => {
        const newCount = watchedCount + 1;
        setWatchedCount(newCount);

        // 最後の動画を視聴したら視聴完了を記録
        if (newCount >= totalVideos && !isWatched) {
            setIsSubmitting(true);
            const success = await markLectureAsWatched({ coreProblemId: coreProblem.id });
            if (success) {
                setIsWatched(true);
                router.refresh(); // ページを更新して最新データを取得
            }
            setIsSubmitting(false);
        }
    };

    const handleVideoClose = () => {
        setIsVideoOpen(false);
        setWatchedCount(0); // リセット
    };

    const hasVideos = lectureVideos.length > 0;
    const needsWatching = hasVideos && !isWatched;

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

            {/* 未視聴の講義動画がある場合の警告 */}
            {needsWatching && (
                <Alert className="mb-6 bg-amber-50 border-amber-200 text-amber-800">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>講義動画を視聴してください</AlertTitle>
                    <AlertDescription>
                        講義動画を視聴するまで、この単元の問題は「おまかせ」モードで出題されません。
                        下の「講義動画を見る」ボタンから動画を最後まで視聴してください。
                    </AlertDescription>
                </Alert>
            )}

            {/* 視聴完了済みの場合の表示 */}
            {hasVideos && isWatched && (
                <Alert className="mb-6 bg-green-50 border-green-200 text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>講義動画視聴済み</AlertTitle>
                    <AlertDescription>
                        この単元の講義動画は視聴済みです。復習のため再度視聴することもできます。
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-8">
                {/* 1. Video Section */}
                <section>
                    <Card className={`overflow-hidden shadow-lg ${needsWatching ? 'border-2 border-amber-400' : 'border-2 border-primary/10'}`}>
                        <CardHeader className="bg-muted/30 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <PlayCircle className={`w-5 h-5 ${needsWatching ? 'text-amber-600' : 'text-blue-600'}`} />
                                講義動画を視聴
                                {needsWatching && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full ml-2">必須</span>}
                            </CardTitle>
                            <CardDescription>
                                {needsWatching
                                    ? '最後まで視聴すると問題が解禁されます'
                                    : 'ポイントを動画で確認して理解を深めましょう'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {lectureVideos.length > 0 ? (
                                <div className="p-6">
                                    {/* Main Play Button (starts from beginning) */}
                                    <div className={`aspect-video w-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed mb-4 group cursor-pointer transition-colors ${needsWatching
                                        ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                        : 'bg-black/5 border-gray-200 hover:bg-black/10'
                                        }`}
                                        onClick={() => {
                                            setStartIndex(0);
                                            setIsVideoOpen(true);
                                        }}>
                                        <PlayCircle className={`w-16 h-16 mb-2 group-hover:scale-110 transition-transform ${needsWatching ? 'text-amber-500' : 'text-blue-500'
                                            }`} />
                                        <p className={`font-semibold text-lg ${needsWatching ? 'text-amber-700' : 'text-blue-700'}`}>
                                            {needsWatching ? '今すぐ視聴する' : '再生する'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{lectureVideos[0].title}</p>
                                    </div>

                                    <Button
                                        className={`w-full text-lg py-6 gap-2 mb-4 ${needsWatching
                                            ? 'bg-amber-500 hover:bg-amber-600'
                                            : ''
                                            }`}
                                        size="lg"
                                        disabled={isSubmitting}
                                        onClick={() => {
                                            setStartIndex(0);
                                            setIsVideoOpen(true);
                                        }}
                                    >
                                        <PlayCircle className="w-6 h-6" />
                                        {isSubmitting ? '処理中...' : `講義動画を見る ${lectureVideos.length > 1 ? `(${lectureVideos.length})` : ''}`}
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
                                        onClose={handleVideoClose}
                                        initialIndex={startIndex}
                                        playlist={lectureVideos.map(v => ({
                                            title: v.title || coreProblem.name,
                                            url: v.url
                                        }))}
                                        onVideoEnd={handleVideoEnd}
                                        autoCloseOnLastVideoEnd={true}
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
                    <Card className={`border-2 shadow-md ${needsWatching ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-primary/20 bg-primary/5'}`}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {needsWatching ? (
                                    <Lock className="w-6 h-6 text-gray-400" />
                                ) : (
                                    <Printer className="w-6 h-6 text-primary" />
                                )}
                                問題を印刷する
                                {needsWatching && <span className="text-xs bg-gray-400 text-white px-2 py-0.5 rounded-full ml-2">講義動画視聴後</span>}
                            </CardTitle>
                            <CardDescription>
                                {needsWatching
                                    ? '講義動画を視聴すると印刷できるようになります'
                                    : 'この単元の問題を出題します'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                size="lg"
                                className="w-full sm:w-auto text-lg py-6 gap-3 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                asChild
                                disabled={needsWatching}
                            >
                                <Link
                                    href={needsWatching ? '#' : `/dashboard/print?subjectId=${coreProblem.subjectId}&coreProblemId=${coreProblem.id}`}
                                    onClick={(e) => needsWatching && e.preventDefault()}
                                    className={needsWatching ? 'pointer-events-none' : ''}
                                >
                                    {needsWatching ? (
                                        <Lock className="w-5 h-5" />
                                    ) : (
                                        <Printer className="w-5 h-5" />
                                    )}
                                    {needsWatching ? '講義動画を視聴してください' : '今すぐ問題を印刷する'}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
