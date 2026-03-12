import { useCallback, useEffect, useRef, useState } from 'react';

type YouTubePlayerLike = {
    getCurrentTime: () => number;
    setPlaybackRate: (rate: number) => void;
    getPlaybackRate: () => number;
    seekTo: (time: number, allowSeekAhead?: boolean) => void;
    getDuration?: () => number;
};

type YouTubeLikeEvent = {
    target: YouTubePlayerLike;
    data?: number;
};

type RegisterPlayerOptions = {
    captureDuration?: boolean;
};

const DEFAULT_ALLOWED_RATES = [1, 1.25, 1.5];

export function useYouTubePlaybackGuard(allowedRates: number[] = DEFAULT_ALLOWED_RATES) {
    const [currentRate, setCurrentRate] = useState(1);
    const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
    const [durationSeconds, setDurationSeconds] = useState(0);
    const playerRef = useRef<YouTubePlayerLike | null>(null);
    const captureDurationRef = useRef(false);
    const watchedTimeRef = useRef(0);
    const lastTimeRef = useRef(0);
    const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const videoDurationRef = useRef(0);

    const stopTracking = useCallback(() => {
        if (trackingIntervalRef.current) {
            clearInterval(trackingIntervalRef.current);
            trackingIntervalRef.current = null;
        }
    }, []);

    const updateDurationFromPlayer = useCallback((player: YouTubePlayerLike) => {
        if (!captureDurationRef.current || typeof player.getDuration !== 'function') {
            videoDurationRef.current = 0;
            setDurationSeconds(0);
            return 0;
        }

        const duration = player.getDuration();
        if (Number.isFinite(duration) && duration >= 0) {
            videoDurationRef.current = duration;
            setDurationSeconds(duration);
            return duration;
        }

        videoDurationRef.current = 0;
        setDurationSeconds(0);
        return 0;
    }, []);

    const syncPlaybackProgress = useCallback((player: YouTubePlayerLike) => {
        const currentTime = player.getCurrentTime();
        setCurrentTimeSeconds(currentTime);
        updateDurationFromPlayer(player);

        return currentTime;
    }, [updateDurationFromPlayer]);

    const resetTracking = useCallback(() => {
        stopTracking();
        captureDurationRef.current = false;
        watchedTimeRef.current = 0;
        lastTimeRef.current = 0;
        videoDurationRef.current = 0;
        setCurrentTimeSeconds(0);
        setDurationSeconds(0);
        setCurrentRate(1);
    }, [stopTracking]);

    const startTracking = useCallback((player: YouTubePlayerLike) => {
        stopTracking();
        trackingIntervalRef.current = setInterval(() => {
            try {
                const currentTime = syncPlaybackProgress(player);
                const diff = currentTime - lastTimeRef.current;
                // 通常の再生進行（0〜3秒の範囲）のみカウント
                if (diff > 0 && diff < 3) {
                    watchedTimeRef.current += diff;
                }
                lastTimeRef.current = currentTime;
            } catch {
                // プレイヤー状態更新直後など、瞬間的に取得できないケースは無視する
            }
        }, 1000);
    }, [stopTracking, syncPlaybackProgress]);

    const registerPlayer = useCallback((player: YouTubePlayerLike, options: RegisterPlayerOptions = {}) => {
        playerRef.current = player;
        captureDurationRef.current = options.captureDuration ?? false;
        player.setPlaybackRate(1);
        setCurrentRate(1);
        lastTimeRef.current = 0;
        setCurrentTimeSeconds(0);

        updateDurationFromPlayer(player);

        try {
            syncPlaybackProgress(player);
        } catch {
            // onReady直後に再生情報を取得できない場合があるため無視する
        }

        startTracking(player);
    }, [startTracking, syncPlaybackProgress, updateDurationFromPlayer]);

    const handlePlaybackRateChange = useCallback((event: YouTubeLikeEvent) => {
        const rate = event.target.getPlaybackRate();
        if (!allowedRates.includes(rate)) {
            event.target.setPlaybackRate(1);
            setCurrentRate(1);
            return;
        }
        setCurrentRate(rate);
    }, [allowedRates]);

    const changeSpeed = useCallback((rate: number) => {
        if (!playerRef.current || !allowedRates.includes(rate)) {
            return;
        }
        playerRef.current.setPlaybackRate(rate);
        setCurrentRate(rate);
    }, [allowedRates]);

    const seekRelative = useCallback((offsetSeconds: number) => {
        if (!playerRef.current) {
            return false;
        }

        try {
            const currentTime = playerRef.current.getCurrentTime();
            const nextTime = Math.max(0, currentTime + offsetSeconds);
            playerRef.current.seekTo(nextTime, true);
            lastTimeRef.current = nextTime;
            setCurrentTimeSeconds(nextTime);
            return true;
        } catch {
            return false;
        }
    }, []);

    const handleStateChange = useCallback((event: YouTubeLikeEvent) => {
        // 1: PLAYING
        if (event.data !== 1) {
            return;
        }
        const currentTime = event.target.getCurrentTime();
        const diff = currentTime - lastTimeRef.current;
        // 5秒以上の前方ジャンプはシーク判定
        if (diff > 5 && lastTimeRef.current > 0 && watchedTimeRef.current > 0) {
            event.target.seekTo(lastTimeRef.current, true);
            setCurrentTimeSeconds(lastTimeRef.current);
            return;
        }
        lastTimeRef.current = currentTime;
        setCurrentTimeSeconds(currentTime);

        updateDurationFromPlayer(event.target);
    }, [updateDurationFromPlayer]);

    const markPlaybackCompleted = useCallback(() => {
        const duration = videoDurationRef.current;
        if (!duration) {
            return;
        }
        watchedTimeRef.current = Math.max(watchedTimeRef.current, duration);
        videoDurationRef.current = duration;
        setCurrentTimeSeconds(duration);
        setDurationSeconds(duration);
        lastTimeRef.current = duration;
    }, []);

    const progressPercent = durationSeconds > 0
        ? Math.min(100, Math.max(0, (currentTimeSeconds / durationSeconds) * 100))
        : 0;

    useEffect(() => () => stopTracking(), [stopTracking]);

    return {
        allowedRates,
        currentRate,
        currentTimeSeconds,
        durationSeconds,
        progressPercent,
        watchedTimeRef,
        videoDurationRef,
        stopTracking,
        resetTracking,
        registerPlayer,
        handlePlaybackRateChange,
        handleStateChange,
        changeSpeed,
        seekRelative,
        markPlaybackCompleted,
    };
}
