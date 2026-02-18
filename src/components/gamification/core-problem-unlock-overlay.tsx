'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Play, CheckCircle2 } from 'lucide-react';
import YouTube, { YouTubeEvent } from 'react-youtube';
import { triggerCelebrationConfetti } from '@/lib/confetti';
import { getYouTubeId } from '@/lib/youtube';
import { useYouTubePlaybackGuard } from '@/hooks/use-youtube-playback-guard';
import { CelebrationOverlayShell } from '@/components/gamification/celebration-overlay-shell';
import { CelebrationIntro } from '@/components/gamification/celebration-intro';
import { markLectureAsWatched } from '@/lib/api/lecture-watched-client';

// 講義動画の型
interface LectureVideo {
    title: string;
    url: string;
}

// アンロックされたCoreProblem情報の型
interface UnlockedCoreProblem {
    eventId: string;
    coreProblemId: string;
    coreProblemName: string;
    lectureVideos: LectureVideo[] | null;
}

// RealtimeEventからデータを取得
async function getUnseenCoreProblemUnlocks(): Promise<UnlockedCoreProblem[]> {
    try {
        const response = await fetch('/api/core-problem-unlocks');
        if (!response.ok) return [];
        return await response.json();
    } catch {
        return [];
    }
}

async function markCoreProblemUnlockAsSeen(eventId: string): Promise<void> {
    try {
        await fetch('/api/core-problem-unlocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId })
        });
    } catch {
        console.error('Failed to mark unlock as seen');
    }
}

export function CoreProblemUnlockOverlay() {
    const [queue, setQueue] = useState<UnlockedCoreProblem[]>([]);
    const [current, setCurrent] = useState<UnlockedCoreProblem | null>(null);
    const [showVideo, setShowVideo] = useState(false);
    const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
    const [videoEnded, setVideoEnded] = useState(false);
    const [showUnderstoodButton, setShowUnderstoodButton] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const {
        allowedRates,
        currentRate,
        watchedTimeRef,
        videoDurationRef,
        stopTracking,
        resetTracking,
        registerPlayer,
        handlePlaybackRateChange,
        handleStateChange,
        changeSpeed,
    } = useYouTubePlaybackGuard();

    useEffect(() => {
        const checkUnlocks = async () => {
            try {
                console.log('[CP_UNLOCK] Checking for unseen unlocking events...');
                const unseen = await getUnseenCoreProblemUnlocks();
                console.log(`[CP_UNLOCK] Fetched events: ${unseen.length}`, unseen);
                if (unseen && unseen.length > 0) {
                    setQueue(unseen);
                }
            } catch (error) {
                console.error("Failed to check core problem unlocks:", error);
            }
        };

        checkUnlocks();
    }, []);

    useEffect(() => {
        if (!current && queue.length > 0) {
            const next = queue[0];
            setCurrent(next);
            setShowVideo(false);
            setSelectedVideoIndex(0);
            setVideoEnded(false);
            triggerCelebrationConfetti();
        }
    }, [queue, current]);

    // 動画終了後に遅延でボタン表示（自動クリック対策）
    useEffect(() => {
        if (videoEnded) {
            const timer = setTimeout(() => setShowUnderstoodButton(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [videoEnded]);

    const handleClose = useCallback(async () => {
        if (!current) return;

        // 視聴時間の追跡を停止
        stopTracking();

        // Mark as seen in background
        await markCoreProblemUnlockAsSeen(current.eventId);

        // Remove current from queue
        setQueue((prev) => prev.slice(1));
        setCurrent(null);
        setShowVideo(false);
        setVideoEnded(false);
        setShowUnderstoodButton(false);
        resetTracking();
    }, [current, resetTracking, stopTracking]);

    // 「理解しました」ボタン押下時
    const handleUnderstood = async () => {
        if (!current || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const success = await markLectureAsWatched({
                coreProblemId: current.coreProblemId,
                watchedDurationSeconds: Math.round(watchedTimeRef.current),
                videoDurationSeconds: Math.round(videoDurationRef.current),
            });
            if (success) {
                await handleClose();
            } else {
                // エラー時も閉じる（再試行の機会は単元フォーカスページで）
                await handleClose();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleWatchVideo = (index: number) => {
        setSelectedVideoIndex(index);
        setShowVideo(true);
        setVideoEnded(false);
        setShowUnderstoodButton(false);
        resetTracking();
    };

    // 動画終了時のハンドラ
    const handleVideoEnd = (event: YouTubeEvent) => {
        console.log('[CP_UNLOCK] Video ended', event);
        // 視聴時間の追跡を停止
        stopTracking();
        setVideoEnded(true);
    };

    const videos = current?.lectureVideos || [];
    const selectedVideo = videos[selectedVideoIndex];
    const youtubeId = selectedVideo ? getYouTubeId(selectedVideo.url) : null;
    const hasVideos = videos.length > 0;

    return (
        <AnimatePresence>
            {current && (
                <CelebrationOverlayShell accent="green" maxWidthClassName="max-w-lg">
                            {/* Xボタンは講義動画がない場合のみ表示 */}
                            {/* 講義動画がある場合は動画視聴後に「理解しました」で閉じる */}

                            {!showVideo ? (
                                <>
                                    <CelebrationIntro
                                        accent="green"
                                        title="新しい単元をアンロック！"
                                        description={(
                                            <>
                                                <h3 className="text-2xl font-bold text-gray-800">
                                                    {current.coreProblemName}
                                                </h3>
                                                <p className="text-gray-600 font-medium">
                                                    {hasVideos
                                                        ? 'まずは講義動画を視聴してください。'
                                                        : 'おめでとうございます！新しい学習内容が開放されました。'}
                                                </p>
                                            </>
                                        )}
                                        badgeText="レベルアップ！"
                                    />

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 1.0 }}
                                        className="mt-6 space-y-3"
                                    >
                                        {/* 講義動画がある場合はリスト表示 */}
                                        {hasVideos && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-amber-600 font-medium mb-2">
                                                    ※ 講義動画の視聴が必須です
                                                </p>
                                                {videos.map((video, index) => (
                                                    <Button
                                                        key={index}
                                                        size="lg"
                                                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold text-lg rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95"
                                                        onClick={() => handleWatchVideo(index)}
                                                    >
                                                        <Play className="h-5 w-5 mr-2" />
                                                        {video.title}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}

                                        {/* 講義動画がない場合のみ「やったね！」ボタンを表示 */}
                                        {!hasVideos && (
                                            <Button
                                                size="lg"
                                                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95"
                                                onClick={handleClose}
                                            >
                                                やったね！
                                            </Button>
                                        )}
                                    </motion.div>
                                </>
                            ) : (
                                // 動画視聴モード
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-gray-800">
                                        {current.coreProblemName} - {selectedVideo?.title}
                                    </h3>
                                    {youtubeId && (
                                        <div className="aspect-video w-full relative">
                                            <YouTube
                                                videoId={youtubeId}
                                                opts={{
                                                    width: '100%',
                                                    height: '100%',
                                                    playerVars: {
                                                        autoplay: 1,
                                                        rel: 0,           // おすすめ動画を同チャンネルに制限
                                                        disablekb: 1,      // キーボード操作無効
                                                        controls: 0,       // コントロールバー（シークバー含む）を非表示
                                                        fs: 0,             // フルスクリーンボタン無効
                                                        iv_load_policy: 3, // アノテーション非表示
                                                    },
                                                }}
                                                className="w-full h-full"
                                                onReady={(event: YouTubeEvent) => {
                                                    registerPlayer(event.target, { captureDuration: true });
                                                }}
                                                onEnd={handleVideoEnd}
                                                onPlaybackRateChange={handlePlaybackRateChange}
                                                onStateChange={handleStateChange}
                                            />
                                            {/* YouTubeロゴへのクリックをブロックするオーバーレイ */}
                                            <div className="absolute bottom-0 right-0 w-40 h-12 z-[5]" style={{ pointerEvents: 'auto' }} />
                                            {/* 動画終了後にレコメンド動画を隠すオーバーレイ */}
                                            {videoEnded && (
                                                <div className="absolute inset-0 z-[6] bg-black flex items-center justify-center">
                                                    <div className="text-white/60 text-sm">動画の再生が完了しました</div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 速度コントロール */}
                                    {!videoEnded && youtubeId && (
                                        <div className="flex items-center gap-1 mt-2">
                                            <span className="text-xs text-gray-500 mr-1">速度:</span>
                                            {allowedRates.map((rate) => (
                                                <button
                                                    key={rate}
                                                    onClick={() => changeSpeed(rate)}
                                                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${currentRate === rate
                                                            ? 'bg-green-500 text-white'
                                                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                        }`}
                                                >
                                                    {rate}x
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* 動画終了後に「理解しました」ボタンを表示（2秒遅延） */}
                                    {showUnderstoodButton ? (
                                        <div className="space-y-2">
                                            <Button
                                                size="lg"
                                                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95"
                                                onClick={handleUnderstood}
                                                disabled={isSubmitting}
                                            >
                                                <CheckCircle2 className="h-5 w-5 mr-2" />
                                                {isSubmitting ? '処理中...' : '理解しました！'}
                                            </Button>
                                            {videos.length > 1 && (
                                                <Button
                                                    size="lg"
                                                    variant="outline"
                                                    className="w-full"
                                                    onClick={() => setShowVideo(false)}
                                                    disabled={isSubmitting}
                                                >
                                                    他の動画も見る
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center text-gray-500 text-sm">
                                            <p>動画を最後まで視聴すると「理解しました」ボタンが表示されます</p>
                                        </div>
                                    )}
                                </div>
                            )}
                </CelebrationOverlayShell>
            )}
        </AnimatePresence>
    );
}
