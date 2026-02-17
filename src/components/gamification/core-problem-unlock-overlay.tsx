'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Trophy, Star, Play, CheckCircle2 } from 'lucide-react';
import YouTube, { YouTubeEvent } from 'react-youtube';

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

// 講義動画視聴完了を記録
async function markLectureAsWatched(coreProblemId: string, watchedDurationSeconds?: number, videoDurationSeconds?: number): Promise<boolean> {
    try {
        const response = await fetch('/api/lecture-watched', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coreProblemId, watchedDurationSeconds, videoDurationSeconds })
        });
        return response.ok;
    } catch {
        console.error('Failed to mark lecture as watched');
        return false;
    }
}

// 許可する再生速度
const ALLOWED_RATES = [1, 1.25, 1.5];

// YouTubeのURLからビデオIDを抽出
function getYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export function CoreProblemUnlockOverlay() {
    const [queue, setQueue] = useState<UnlockedCoreProblem[]>([]);
    const [current, setCurrent] = useState<UnlockedCoreProblem | null>(null);
    const [showVideo, setShowVideo] = useState(false);
    const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
    const [videoEnded, setVideoEnded] = useState(false);
    const [showUnderstoodButton, setShowUnderstoodButton] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentRate, setCurrentRate] = useState(1);
    const playerRef = useRef<any>(null);
    const watchedTimeRef = useRef(0);
    const lastTimeRef = useRef(0);
    const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const videoDurationRef = useRef(0);

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
            triggerConfetti();
        }
    }, [queue, current]);

    // 動画終了後に遅延でボタン表示（自動クリック対策）
    useEffect(() => {
        if (videoEnded) {
            const timer = setTimeout(() => setShowUnderstoodButton(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [videoEnded]);

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (trackingIntervalRef.current) {
                clearInterval(trackingIntervalRef.current);
            }
        };
    }, []);

    // 視聴時間を追跡する
    const startTracking = useCallback((player: any) => {
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
        }
        trackingIntervalRef.current = setInterval(() => {
            if (player && typeof player.getCurrentTime === 'function') {
                try {
                    const currentTime = player.getCurrentTime();
                    const diff = currentTime - lastTimeRef.current;
                    // 通常の再生進行（0〜3秒の範囲）のみカウント
                    if (diff > 0 && diff < 3) {
                        watchedTimeRef.current += diff;
                    }
                    lastTimeRef.current = currentTime;
                } catch { }
            }
        }, 1000);
    }, []);

    const handleClose = useCallback(async () => {
        if (!current) return;

        // 視聴時間の追跡を停止
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
        }

        // Mark as seen in background
        await markCoreProblemUnlockAsSeen(current.eventId);

        // Remove current from queue
        setQueue((prev) => prev.slice(1));
        setCurrent(null);
        setShowVideo(false);
        setVideoEnded(false);
        setShowUnderstoodButton(false);
        watchedTimeRef.current = 0;
        lastTimeRef.current = 0;
        videoDurationRef.current = 0;
    }, [current]);

    // 「理解しました」ボタン押下時
    const handleUnderstood = async () => {
        if (!current || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const success = await markLectureAsWatched(
                current.coreProblemId,
                Math.round(watchedTimeRef.current),
                Math.round(videoDurationRef.current)
            );
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
        watchedTimeRef.current = 0;
        lastTimeRef.current = 0;
        videoDurationRef.current = 0;
    };

    // 動画終了時のハンドラ
    const handleVideoEnd = (event: YouTubeEvent) => {
        console.log('[CP_UNLOCK] Video ended', event);
        // 視聴時間の追跡を停止
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
        }
        setVideoEnded(true);
    };

    // 再生速度変更の防止（許可範囲外のみ）
    const handlePlaybackRateChange = (event: YouTubeEvent) => {
        const rate = event.target.getPlaybackRate();
        if (!ALLOWED_RATES.includes(rate)) {
            event.target.setPlaybackRate(1);
            setCurrentRate(1);
        } else {
            setCurrentRate(rate);
        }
    };

    // 手動で速度を変更する
    const changeSpeed = (rate: number) => {
        if (playerRef.current) {
            playerRef.current.setPlaybackRate(rate);
            setCurrentRate(rate);
        }
    };

    // シーク防止: 大幅なジャンプを検知して元に戻す
    const handleStateChange = (event: YouTubeEvent) => {
        const player = event.target;
        if (event.data === 1) { // PLAYING
            const currentTime = player.getCurrentTime();
            const diff = currentTime - lastTimeRef.current;
            // 5秒以上の前方ジャンプはシーク判定
            if (diff > 5 && lastTimeRef.current > 0 && watchedTimeRef.current > 0) {
                player.seekTo(lastTimeRef.current, true);
            } else {
                lastTimeRef.current = currentTime;
            }
        }
    };

    const triggerConfetti = () => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    const videos = current?.lectureVideos || [];
    const selectedVideo = videos[selectedVideoIndex];
    const youtubeId = selectedVideo ? getYouTubeId(selectedVideo.url) : null;
    const hasVideos = videos.length > 0;

    return (
        <AnimatePresence>
            {current && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ scale: 0.5, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0.5, rotate: 10, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className="w-full max-w-lg relative"
                    >
                        {/* Shining background effect */}
                        <div className="absolute inset-0 bg-green-400 rounded-full blur-3xl opacity-20 animate-pulse"></div>

                        <div className="bg-gradient-to-br from-green-100 to-white text-center p-8 rounded-3xl shadow-2xl relative border-4 border-green-400">
                            {/* Xボタンは講義動画がない場合のみ表示 */}
                            {/* 講義動画がある場合は動画視聴後に「理解しました」で閉じる */}

                            {!showVideo ? (
                                <>
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring" }}
                                        className="inline-block p-6 rounded-full bg-green-400 shadow-inner mb-6"
                                    >
                                        <Trophy className="h-16 w-16 text-white" />
                                    </motion.div>

                                    <motion.h2
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-3xl font-black text-green-600 mb-2"
                                    >
                                        新しい単元をアンロック！
                                    </motion.h2>

                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="mb-6 space-y-2"
                                    >
                                        <h3 className="text-2xl font-bold text-gray-800">
                                            {current.coreProblemName}
                                        </h3>
                                        <p className="text-gray-600 font-medium">
                                            {hasVideos
                                                ? 'まずは講義動画を視聴してください。'
                                                : 'おめでとうございます！新しい学習内容が開放されました。'}
                                        </p>
                                    </motion.div>

                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.6, type: "spring" }}
                                        className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-2 rounded-full font-bold text-lg shadow-lg mb-6"
                                    >
                                        <Star className="h-5 w-5 fill-current" />
                                        レベルアップ！
                                    </motion.div>

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
                                                    playerRef.current = event.target;
                                                    event.target.setPlaybackRate(1);
                                                    videoDurationRef.current = event.target.getDuration();
                                                    lastTimeRef.current = 0;
                                                    startTracking(event.target);
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
                                            {ALLOWED_RATES.map((rate) => (
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
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
