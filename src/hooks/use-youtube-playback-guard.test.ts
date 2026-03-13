import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useYouTubePlaybackGuard } from "./use-youtube-playback-guard";

type MockPlayerState = {
    currentTime: number;
    duration: number;
    playbackRate: number;
};

function createMockPlayer(initialState: Partial<MockPlayerState> = {}) {
    const state: MockPlayerState = {
        currentTime: initialState.currentTime ?? 0,
        duration: initialState.duration ?? 0,
        playbackRate: initialState.playbackRate ?? 1,
    };

    const player = {
        getCurrentTime: vi.fn(() => state.currentTime),
        setPlaybackRate: vi.fn((rate: number) => {
            state.playbackRate = rate;
        }),
        getPlaybackRate: vi.fn(() => state.playbackRate),
        seekTo: vi.fn((time: number) => {
            state.currentTime = time;
        }),
        getDuration: vi.fn(() => state.duration),
    };

    return { player, state };
}

describe("useYouTubePlaybackGuard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("再生進捗を公開し、リセット時に初期化する", () => {
        const { result } = renderHook(() => useYouTubePlaybackGuard());
        const { player, state } = createMockPlayer({ duration: 120 });

        act(() => {
            result.current.registerPlayer(player, { captureDuration: true });
        });

        expect(result.current.durationSeconds).toBe(120);
        expect(result.current.progressPercent).toBe(0);

        act(() => {
            state.currentTime = 30;
            vi.advanceTimersByTime(1000);
        });

        expect(result.current.currentTimeSeconds).toBe(30);
        expect(result.current.durationSeconds).toBe(120);
        expect(result.current.progressPercent).toBe(25);

        act(() => {
            result.current.resetTracking();
        });

        expect(result.current.currentTimeSeconds).toBe(0);
        expect(result.current.durationSeconds).toBe(0);
        expect(result.current.progressPercent).toBe(0);
    });

    it("10秒戻し時に進捗表示も更新する", () => {
        const { result } = renderHook(() => useYouTubePlaybackGuard());
        const { player } = createMockPlayer({ currentTime: 50, duration: 120 });

        act(() => {
            result.current.registerPlayer(player, { captureDuration: true });
            vi.advanceTimersByTime(1000);
        });

        act(() => {
            expect(result.current.seekRelative(-10)).toBe(true);
        });

        expect(player.seekTo).toHaveBeenCalledWith(40, true);
        expect(result.current.currentTimeSeconds).toBe(40);
        expect(result.current.progressPercent).toBeCloseTo(33.333, 2);
    });

    it("未視聴区間を飛ばす前方ジャンプを差し戻す", () => {
        const { result } = renderHook(() => useYouTubePlaybackGuard());
        const { player, state } = createMockPlayer({ duration: 120 });

        act(() => {
            result.current.registerPlayer(player, { captureDuration: true });
        });

        act(() => {
            state.currentTime = 1;
            vi.advanceTimersByTime(1000);
        });

        act(() => {
            state.currentTime = 12;
            result.current.handleStateChange({ data: 1, target: player });
        });

        expect(player.seekTo).toHaveBeenLastCalledWith(1, true);
        expect(result.current.currentTimeSeconds).toBe(1);
    });

    it("captureDuration が false のときは duration を公開しない", () => {
        const { result } = renderHook(() => useYouTubePlaybackGuard());
        const { player, state } = createMockPlayer({ duration: 180 });

        act(() => {
            result.current.registerPlayer(player);
        });

        act(() => {
            state.currentTime = 45;
            vi.advanceTimersByTime(1000);
            result.current.handleStateChange({ data: 1, target: player });
        });

        expect(result.current.currentTimeSeconds).toBe(45);
        expect(result.current.durationSeconds).toBe(0);
        expect(result.current.videoDurationRef.current).toBe(0);
        expect(result.current.progressPercent).toBe(0);
    });
});
