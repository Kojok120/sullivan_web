import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { VideoPlayerDialog } from "../video-player-dialog";
import type { MouseEventHandler, ReactNode } from "react";
import jaMessages from "@/messages/ja.json";

type ButtonProps = {
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLButtonElement>;
};

type MockVideoData = {
    title: string;
    url: string;
    id?: string;
};

type MockPlayerProps = {
    isOpen: boolean;
    onClose: () => void;
    playlist: MockVideoData[];
    initialIndex?: number;
    onVideoEnd?: (video: MockVideoData, index: number, watchedDurationSeconds?: number, videoDurationSeconds?: number) => void;
};

const { refreshMock, markVideoWatchedMock } = vi.hoisted(() => ({
    refreshMock: vi.fn(),
    markVideoWatchedMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        refresh: refreshMock,
    }),
}));

vi.mock("@/app/actions", () => ({
    markVideoWatched: markVideoWatchedMock,
}));

vi.mock("@/components/ui/button", () => ({
    Button: ({ children, onClick }: ButtonProps) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("../full-screen-video-player", () => ({
    FullScreenVideoPlayer: ({
        isOpen,
        onClose,
        playlist,
        initialIndex = 0,
        onVideoEnd,
    }: MockPlayerProps) => (
        <div data-testid="mock-player" data-open={isOpen ? "true" : "false"}>
            {isOpen && (
                <>
                    <button onClick={onClose}>mock-close</button>
                    <button onClick={() => onVideoEnd?.(playlist[initialIndex], initialIndex)}>
                        mock-end-current
                    </button>
                    <button onClick={() => onVideoEnd?.(playlist[0], 0)}>
                        mock-end-first
                    </button>
                </>
            )}
        </div>
    ),
}));

function renderWithIntl(ui: ReactNode) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>
    );
}

describe("VideoPlayerDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        markVideoWatchedMock.mockResolvedValue(undefined);
    });

    it("途中で閉じた場合は視聴済みにならない", async () => {
        renderWithIntl(
            <VideoPlayerDialog
                videoUrl="https://example.com/video"
                historyId="history-1"
                isWatched={false}
                isRequired={true}
            />
        );

        expect(screen.getByRole("button", { name: "解説動画を見る" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "解説動画を見る" }));
        // FullScreenVideoPlayer は dynamic import なので非同期マウントを待つ
        fireEvent.click(await screen.findByRole("button", { name: "mock-close" }));

        await waitFor(() => {
            expect(refreshMock).toHaveBeenCalledTimes(1);
        });
        expect(markVideoWatchedMock).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "解説動画を見る" })).toBeTruthy();
    });

    it("動画終了時のみ視聴済みになり markVideoWatched を呼ぶ", async () => {
        renderWithIntl(
            <VideoPlayerDialog
                videoUrl="https://example.com/video"
                historyId="history-1"
                isWatched={false}
                isRequired={true}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "解説動画を見る" }));
        fireEvent.click(await screen.findByRole("button", { name: "mock-end-current" }));

        await waitFor(() => {
            expect(markVideoWatchedMock).toHaveBeenCalledWith("history-1");
        });
        expect(screen.getByRole("button", { name: "復習する" })).toBeTruthy();
    });

    it("プレイリストで別動画が終了しても対象動画の視聴状態は変わらない", async () => {
        renderWithIntl(
            <VideoPlayerDialog
                videoUrl="https://example.com/video-2"
                historyId="history-2"
                isWatched={false}
                isRequired={true}
                playlist={[
                    {
                        historyId: "history-1",
                        videoUrl: "https://example.com/video-1",
                        question: "問題1",
                    },
                    {
                        historyId: "history-2",
                        videoUrl: "https://example.com/video-2",
                        question: "問題2",
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "解説動画を見る" }));
        fireEvent.click(await screen.findByRole("button", { name: "mock-end-first" }));

        await waitFor(() => {
            expect(markVideoWatchedMock).toHaveBeenCalledWith("history-1");
        });
        expect(screen.getByRole("button", { name: "解説動画を見る" })).toBeTruthy();
    });
});
