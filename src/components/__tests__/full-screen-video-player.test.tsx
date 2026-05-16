import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import jaMessages from "@/messages/ja.json";
import { FullScreenVideoPlayer } from "../full-screen-video-player";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: ReactNode;
};

type DivProps = HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
};

const { useYouTubePlaybackGuardMock, youtubePlayerTargetMock } = vi.hoisted(() => ({
    useYouTubePlaybackGuardMock: vi.fn(),
    youtubePlayerTargetMock: { getDuration: vi.fn(() => 120) },
}));

vi.mock("react-youtube", () => ({
    default: ({
        videoId,
        onReady,
        onEnd,
    }: {
        videoId: string;
        onReady?: (event: { target: typeof youtubePlayerTargetMock }) => void;
        onEnd?: () => void;
    }) => (
        <div data-testid="mock-youtube" data-video-id={videoId}>
            <button type="button" onClick={() => onReady?.({ target: youtubePlayerTargetMock })}>
                mock-youtube-ready
            </button>
            <button type="button" onClick={() => onEnd?.()}>
                mock-youtube-end
            </button>
        </div>
    ),
}));

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
    },
}));

vi.mock("@/hooks/use-youtube-playback-guard", () => ({
    useYouTubePlaybackGuard: useYouTubePlaybackGuardMock,
}));

vi.mock("@/components/ui/button", () => ({
    Button: ({ children, ...props }: ButtonProps) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children, showCloseButton, ...props }: DivProps & { showCloseButton?: boolean }) => {
        void showCloseButton;
        return <div {...props}>{children}</div>;
    },
    DialogHeader: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
    DialogDescription: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
}));

function renderWithIntl(ui: ReactNode) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>
    );
}

describe("FullScreenVideoPlayer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        youtubePlayerTargetMock.getDuration.mockClear();
        useYouTubePlaybackGuardMock.mockReturnValue({
            allowedRates: [1, 1.25, 1.5],
            currentRate: 1,
            currentTimeSeconds: 30,
            durationSeconds: 120,
            progressPercent: 25,
            watchedTimeRef: { current: 120 },
            videoDurationRef: { current: 120 },
            stopTracking: vi.fn(),
            resetTracking: vi.fn(),
            registerPlayer: vi.fn(),
            handlePlaybackRateChange: vi.fn(),
            handleStateChange: vi.fn(),
            changeSpeed: vi.fn(),
            seekRelative: vi.fn(),
            markPlaybackCompleted: vi.fn(),
        });
    });

    it("YouTube動画では読み取り専用の進捗バーと時間表示を出す", () => {
        renderWithIntl(
            <FullScreenVideoPlayer
                isOpen
                onClose={vi.fn()}
                playlist={[{ title: "講義動画", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]}
            />
        );

        expect(screen.getByText("再生進捗")).toBeInTheDocument();
        expect(screen.getByText("00:30 / 02:00")).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "動画の再生進捗" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "10秒戻す" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByTestId("playback-rate-container")).toHaveClass("bottom-24");
        expect(screen.getByTestId("player-right-guard")).toHaveClass("w-[35%]");
    });

    it("YouTube動画では ready と end から再生時間を通知する", () => {
        const registerPlayer = vi.fn();
        const onVideoEnd = vi.fn();
        const playlist = [{ title: "講義動画", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];

        useYouTubePlaybackGuardMock.mockReturnValue({
            allowedRates: [1, 1.25, 1.5],
            currentRate: 1,
            currentTimeSeconds: 30,
            durationSeconds: 120,
            progressPercent: 25,
            watchedTimeRef: { current: 95 },
            videoDurationRef: { current: 120 },
            stopTracking: vi.fn(),
            resetTracking: vi.fn(),
            registerPlayer,
            handlePlaybackRateChange: vi.fn(),
            handleStateChange: vi.fn(),
            changeSpeed: vi.fn(),
            seekRelative: vi.fn(),
            markPlaybackCompleted: vi.fn(),
        });

        renderWithIntl(
            <FullScreenVideoPlayer
                isOpen
                onClose={vi.fn()}
                playlist={playlist}
                onVideoEnd={onVideoEnd}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "mock-youtube-ready" }));
        expect(registerPlayer).toHaveBeenCalledWith(youtubePlayerTargetMock, { captureDuration: true });

        fireEvent.click(screen.getByRole("button", { name: "mock-youtube-end" }));
        expect(onVideoEnd).toHaveBeenCalledWith(playlist[0], 0, 95, 120);
    });

    it("YouTube以外の動画では進捗バーと速度変更を表示しない", () => {
        renderWithIntl(
            <FullScreenVideoPlayer
                isOpen
                onClose={vi.fn()}
                playlist={[{ title: "外部動画", url: "https://example.com/video.mp4" }]}
            />
        );

        expect(screen.queryByText("再生進捗")).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar", { name: "動画の再生進捗" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "10秒戻す" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "1x" })).not.toBeInTheDocument();
    });

    it("追跡必須の非YouTube動画では案内メッセージを表示する", () => {
        renderWithIntl(
            <FullScreenVideoPlayer
                isOpen
                onClose={vi.fn()}
                playlist={[{ title: "外部動画", url: "https://example.com/video.mp4" }]}
                onVideoEnd={vi.fn()}
                requiresTrackedCompletion
            />
        );

        expect(screen.getByRole("alert")).toHaveTextContent("この動画 URL では視聴完了を自動判定できません。管理者に YouTube URL の設定をご確認ください。");
    });
});
