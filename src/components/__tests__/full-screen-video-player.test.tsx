import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { FullScreenVideoPlayer } from "../full-screen-video-player";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: ReactNode;
};

type DivProps = HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
};

const { useYouTubePlaybackGuardMock } = vi.hoisted(() => ({
    useYouTubePlaybackGuardMock: vi.fn(),
}));

vi.mock("react-youtube", () => ({
    default: ({ videoId }: { videoId: string }) => (
        <div data-testid="mock-youtube" data-video-id={videoId} />
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
    DialogContent: ({ children, ...props }: DivProps & { showCloseButton?: boolean }) => {
        const { showCloseButton: _showCloseButton, ...rest } = props;
        return <div {...rest}>{children}</div>;
    },
    DialogHeader: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
    DialogDescription: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
}));

describe("FullScreenVideoPlayer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useYouTubePlaybackGuardMock.mockReturnValue({
            allowedRates: [1, 1.25, 1.5],
            currentRate: 1,
            currentTimeSeconds: 30,
            durationSeconds: 120,
            progressPercent: 25,
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
        render(
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
    });

    it("YouTube以外の動画では進捗バーを表示しない", () => {
        render(
            <FullScreenVideoPlayer
                isOpen
                onClose={vi.fn()}
                playlist={[{ title: "外部動画", url: "https://example.com/video.mp4" }]}
            />
        );

        expect(screen.queryByText("再生進捗")).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar", { name: "動画の再生進捗" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "10秒戻す" })).not.toBeInTheDocument();
    });
});
