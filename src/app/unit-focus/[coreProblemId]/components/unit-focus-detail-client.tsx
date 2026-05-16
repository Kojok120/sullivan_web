"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Printer, ArrowLeft, PlayCircle, Video as VideoIcon, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

// 講義プレーヤーは framer-motion / react-youtube を含むため、
// ユーザーが「動画を見る」を押した時点まで chunk のロードを遅らせる。
const FullScreenVideoPlayer = dynamic(
    () => import("@/components/full-screen-video-player").then((mod) => mod.FullScreenVideoPlayer),
    { ssr: false },
);
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
    isUnlocked: boolean;
    isLectureWatched: boolean;
    fromPrint: boolean;
    returnToPrintUrl: string | null;
}

export function UnitFocusDetailClient({
    coreProblem,
    lectureVideos,
    isUnlocked,
    isLectureWatched,
    fromPrint,
    returnToPrintUrl
}: UnitFocusDetailClientProps) {
    const t = useTranslations('UnitFocusDetail');
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
        if (newCount >= totalVideos && !isWatched && !isSubmitting) {
            if (!isUnlocked) {
                return;
            }
            setIsSubmitting(true);
            try {
                const success = await markLectureAsWatched({ coreProblemId: coreProblem.id });
                if (success) {
                    setIsWatched(true);
                    router.refresh(); // ページを更新して最新データを取得
                }
            } finally {
                setIsSubmitting(false);
            }
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
                    {t('backToList')}
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
                    <AlertTitle>{t('watchAlertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('watchAlertDescriptionLine1')}
                        {t('watchAlertDescriptionLine2')}
                    </AlertDescription>
                </Alert>
            )}

            {/* ロック中の警告 */}
            {!isUnlocked && (
                <Alert className="mb-6 bg-red-50 border-red-200 text-red-800">
                    <Lock className="h-4 w-4" />
                    <AlertTitle>{t('lockedAlertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('lockedAlertDescriptionLine1')}
                        {t('lockedAlertDescriptionLine2')}
                    </AlertDescription>
                </Alert>
            )}

            {/* 印刷導線から遷移した場合の案内 */}
            {fromPrint && returnToPrintUrl && (
                <Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
                    <Printer className="h-4 w-4" />
                    <AlertTitle>{t('printAlertTitle')}</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>
                            {t('printAlertDescription')}
                        </p>
                        <Button type="button" variant="outline" asChild className="w-full sm:w-auto">
                            <Link href={returnToPrintUrl}>{t('returnToPrint')}</Link>
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* 視聴完了済みの場合の表示 */}
            {hasVideos && isWatched && (
                <Alert className="mb-6 bg-green-50 border-green-200 text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{t('watchedAlertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('watchedAlertDescription')}
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-8">
                {/* 1. 講義動画セクション */}
                <section>
                    <Card className={`overflow-hidden ${needsWatching ? 'border-2 border-amber-400' : 'border-2 border-primary/10'}`}>
                        <CardHeader className="bg-muted/30 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <PlayCircle className={`w-5 h-5 ${needsWatching ? 'text-amber-600' : 'text-primary'}`} />
                                {t('lectureCardTitle')}
                                {needsWatching && isUnlocked && (
                                    <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full ml-2">{t('requiredBadge')}</span>
                                )}
                            </CardTitle>
                            <CardDescription>
                                {!isUnlocked && needsWatching
                                    ? t('lectureDescriptionLockedNeedsWatching')
                                    : isUnlocked && needsWatching
                                    ? t('lectureDescriptionUnlockedNeedsWatching')
                                    : t('lectureDescriptionDefault')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {lectureVideos.length > 0 ? (
                                <div className="p-6">
                                    {/* メイン再生ボタン（先頭から再生） */}
                                    <div className={`aspect-video w-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed mb-4 group cursor-pointer transition-colors ${needsWatching
                                        ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                        : 'bg-black/5 border hover:bg-black/10'
                                        }`}
                                        onClick={() => {
                                            setStartIndex(0);
                                            setIsVideoOpen(true);
                                        }}>
                                        <PlayCircle className={`w-16 h-16 mb-2 group-hover:scale-110 transition-transform ${needsWatching ? 'text-amber-500' : 'text-primary'
                                            }`} />
                                        <p className={`font-semibold text-lg ${needsWatching ? 'text-amber-700' : 'text-primary'}`}>
                                            {needsWatching ? t('playNow') : t('play')}
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
                                        {isSubmitting
                                            ? t('processing')
                                            : lectureVideos.length > 1
                                            ? t('watchLectureButtonWithCount', { count: lectureVideos.length })
                                            : t('watchLectureButton')}
                                    </Button>

                                    {/* 動画個別選択リスト */}
                                    {lectureVideos.length > 1 && (
                                        <div className="border-t pt-4 mt-2">
                                            <p className="text-sm font-medium mb-3 text-muted-foreground">{t('selectVideo')}</p>
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
                                                        <span className="truncate">{video.title || t('lectureVideoFallbackTitle', { number: idx + 1 })}</span>
                                                        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                            {t('videoNumberLabel', { number: idx + 1 })}
                                                        </span>
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {isVideoOpen ? (
                                        <FullScreenVideoPlayer
                                            isOpen={isVideoOpen}
                                            onClose={handleVideoClose}
                                            initialIndex={startIndex}
                                            playlist={lectureVideos.map(v => ({
                                                title: v.title || coreProblem.name,
                                                url: v.url
                                            }))}
                                            onVideoEnd={handleVideoEnd}
                                            autoCloseOnLastVideoEnd={false}
                                        />
                                    ) : null}
                                </div>
                            ) : (
                                <div className="p-12 text-center text-muted-foreground bg-muted/10">
                                    <VideoIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>{t('noLectureVideo')}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </section>

                {/* 2. 印刷セクション */}
                <section>
                    <Card className="border-2 border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Printer className="w-6 h-6 text-primary" />
                                {t('printCardTitle')}
                            </CardTitle>
                            <CardDescription>
                                {t('printCardDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                size="lg"
                                className="w-full sm:w-auto text-lg py-6 gap-3 transition-all hover:-translate-y-0.5"
                                asChild
                            >
                                <Link
                                    href={`/dashboard/print?subjectId=${coreProblem.subjectId}&coreProblemId=${coreProblem.id}`}
                                >
                                    <Printer className="w-5 h-5" />
                                    {t('printThisUnit')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
