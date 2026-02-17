"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import YouTube from "react-youtube";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight } from "lucide-react";
import { getYouTubeId, getEmbedUrl } from '@/lib/youtube';

export interface VideoData {
    title: string;          // Used for display
    url: string;            // YouTube URL
    id?: string;            // Optional identifier (e.g., historyId)
}

interface FullScreenVideoPlayerProps {
    isOpen: boolean;
    onClose: () => void;

    // Video Data
    playlist: VideoData[]; // Can be single item array
    initialIndex?: number;

    // Callbacks
    onVideoEnd?: (video: VideoData, index: number) => void;
    onNext?: (currentIndex: number, nextIndex: number) => void;

    // UI Options
    autoCloseOnLastVideoEnd?: boolean;
    showNextButton?: boolean; // If true, shows explicit "Next" button. If false, maybe auto-advance or just close.
    nextButtonLabel?: string;
    closeButtonLabel?: string;
}

export function FullScreenVideoPlayer({
    isOpen,
    onClose,
    playlist,
    initialIndex = 0,
    onVideoEnd,
    onNext,
    autoCloseOnLastVideoEnd = false,
    showNextButton = true,
    nextButtonLabel = "次の動画へ",
    closeButtonLabel = "閉じる",
}: FullScreenVideoPlayerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [videoEnded, setVideoEnded] = useState(false);
    const [showButton, setShowButton] = useState(false);
    const [currentRate, setCurrentRate] = useState(1);
    const playerRef = useRef<any>(null);
    const watchedTimeRef = useRef(0);
    const lastTimeRef = useRef(0);
    const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 許可する再生速度
    const ALLOWED_RATES = [1, 1.25, 1.5];

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            setVideoEnded(false);
            setShowButton(false);
            watchedTimeRef.current = 0;
            lastTimeRef.current = 0;
        }
        return () => {
            if (trackingIntervalRef.current) {
                clearInterval(trackingIntervalRef.current);
            }
        };
    }, [isOpen, initialIndex]);

    // 動画終了後に遅延でボタン表示（自動クリック対策）
    useEffect(() => {
        if (videoEnded) {
            const timer = setTimeout(() => setShowButton(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [videoEnded]);

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

    if (!playlist || playlist.length === 0) return null;

    const currentVideo = playlist[currentIndex];
    const youTubeId = getYouTubeId(currentVideo.url);
    const embedUrl = getEmbedUrl(currentVideo.url);

    const isLastVideo = currentIndex >= playlist.length - 1;

    const handleNext = () => {
        if (!isLastVideo) {
            const nextIndex = currentIndex + 1;
            if (onNext) {
                onNext(currentIndex, nextIndex);
            }
            setCurrentIndex(nextIndex);
        } else {
            onClose();
        }
    };

    const handleVideoEnd = () => {
        setVideoEnded(true);

        // 視聴時間の追跡を停止
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
        }

        // Notify parent
        if (onVideoEnd) {
            onVideoEnd(currentVideo, currentIndex);
        }

        // プレイリスト内の最後でなければ自動進行（終了表示後）
        if (!isLastVideo) {
            // 自動進行は動画終了後に行う
            handleNext();
            setVideoEnded(false);
            setShowButton(false);
            watchedTimeRef.current = 0;
            lastTimeRef.current = 0;
        } else if (autoCloseOnLastVideoEnd) {
            onClose();
        }
    };

    // 再生速度変更の防止（許可範囲外のみ）
    const handlePlaybackRateChange = (event: any) => {
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
    const handleStateChange = (event: any) => {
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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent showCloseButton={false} className="!max-w-none w-screen h-screen p-0 m-0 gap-0 bg-black border-none flex flex-col justify-center items-center duration-0">
                <DialogHeader className="absolute top-4 left-4 right-4 z-10 bg-black/50 p-2 rounded text-white overflow-hidden flex flex-row justify-between items-start pointer-events-none">
                    <div className="flex flex-col overflow-hidden mr-2">
                        <DialogTitle className="text-white truncate text-left">{currentVideo.title}</DialogTitle>
                        <DialogDescription className="text-gray-300 text-left">
                            {playlist.length > 1 ? `${currentIndex + 1} / ${playlist.length}` : "動画を見て理解を深めましょう。"}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 w-full h-full bg-black flex items-center justify-center relative">
                    {youTubeId ? (
                        <YouTube
                            key={currentVideo.url}
                            videoId={youTubeId}
                            className="w-full h-full"
                            iframeClassName="w-full h-full"
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
                                    playsinline: 1,
                                },
                            }}
                            onReady={(event: any) => {
                                playerRef.current = event.target;
                                event.target.setPlaybackRate(1);
                                lastTimeRef.current = 0;
                                startTracking(event.target);
                            }}
                            onEnd={handleVideoEnd}
                            onPlaybackRateChange={handlePlaybackRateChange}
                            onStateChange={handleStateChange}
                        />
                    ) : (
                        <iframe
                            src={embedUrl}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}
                    {/* YouTubeロゴへのクリックをブロックするオーバーレイ */}
                    <div className="absolute bottom-0 right-0 w-40 h-16 z-[5]" style={{ pointerEvents: 'auto' }} />
                    {/* 動画終了後にレコメンド動画を隠すオーバーレイ */}
                    {videoEnded && (
                        <div className="absolute inset-0 z-[6] bg-black flex items-center justify-center">
                            <div className="text-white/60 text-lg">動画の再生が完了しました</div>
                        </div>
                    )}
                </div>

                {/* 速度コントロール（左下） */}
                {!videoEnded && (
                    <div className="absolute bottom-10 left-10 z-10 flex items-center gap-1">
                        {ALLOWED_RATES.map((rate) => (
                            <button
                                key={rate}
                                onClick={() => changeSpeed(rate)}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${currentRate === rate
                                        ? 'bg-white text-black'
                                        : 'bg-white/20 text-white/70 hover:bg-white/30'
                                    }`}
                            >
                                {rate}x
                            </button>
                        ))}
                    </div>
                )}

                <DialogFooter className="absolute bottom-10 right-10 z-10">
                    {showButton ? (
                        isLastVideo ? (
                            <Button variant="secondary" onClick={onClose} className="bg-white/90 hover:bg-white text-black">
                                {closeButtonLabel}
                            </Button>
                        ) : showNextButton ? (
                            <Button variant="default" onClick={() => {
                                handleNext();
                                setVideoEnded(false);
                                setShowButton(false);
                                watchedTimeRef.current = 0;
                                lastTimeRef.current = 0;
                            }} className="bg-white text-black hover:bg-gray-200 gap-2">
                                {nextButtonLabel} <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : null
                    ) : (
                        <div className="text-white/70 text-sm bg-black/50 px-4 py-2 rounded-lg">
                            動画を最後まで視聴してください
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
