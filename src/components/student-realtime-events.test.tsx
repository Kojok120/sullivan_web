import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentRealtimeEvents } from '@/components/student-realtime-events';

const {
    markLevelAsSeenMock,
    pushMock,
    subscribeToUserRealtimeEventsMock,
    toastErrorMock,
    toastSuccessMock,
    getOnInsertHandler,
} = vi.hoisted(() => {
    let onInsertHandler: ((record: unknown) => void | Promise<void>) | null = null;

    return {
        markLevelAsSeenMock: vi.fn(),
        pushMock: vi.fn(),
        subscribeToUserRealtimeEventsMock: vi.fn(async ({ onInsert }: { onInsert: (record: unknown) => void | Promise<void> }) => {
            onInsertHandler = onInsert;
            return () => { };
        }),
        toastErrorMock: vi.fn(),
        toastSuccessMock: vi.fn(),
        getOnInsertHandler: () => onInsertHandler,
    };
});

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        error: toastErrorMock,
        success: toastSuccessMock,
    },
}));

vi.mock('@/app/actions/level', () => ({
    markLevelAsSeen: markLevelAsSeenMock,
}));

vi.mock('@/lib/realtime-events-client', () => ({
    subscribeToUserRealtimeEvents: subscribeToUserRealtimeEventsMock,
}));

vi.mock('@/components/gamification/level-up-modal', () => ({
    LevelUpModal: ({
        data,
        open,
    }: {
        data: { newLevel: number; xpGained: number } | null;
        open: boolean;
    }) => (open && data ? <div>level-up:{data.newLevel}:{data.xpGained}</div> : null),
}));

describe('StudentRealtimeEvents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        markLevelAsSeenMock.mockResolvedValue(undefined);
    });

    it('学生向け購読を 1 回だけ開始する', async () => {
        render(<StudentRealtimeEvents />);

        await waitFor(() => {
            expect(subscribeToUserRealtimeEventsMock).toHaveBeenCalledTimes(1);
        });
    });

    it('grading_completed で toast を表示し、アクションから履歴へ遷移する', async () => {
        render(<StudentRealtimeEvents />);

        await waitFor(() => {
            expect(subscribeToUserRealtimeEventsMock).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await getOnInsertHandler()?.({
                type: 'grading_completed',
                payload: { groupId: 'group-1' },
            });
        });

        expect(toastSuccessMock).toHaveBeenCalledTimes(1);
        const toastOptions = toastSuccessMock.mock.calls[0]?.[1] as {
            action?: { onClick?: () => void };
        };
        toastOptions.action?.onClick?.();
        expect(pushMock).toHaveBeenCalledWith('/dashboard/history/group-1');
    });

    it('gamification_update で level up modal を開き、既読更新を呼ぶ', async () => {
        render(<StudentRealtimeEvents />);

        await waitFor(() => {
            expect(subscribeToUserRealtimeEventsMock).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await getOnInsertHandler()?.({
                type: 'gamification_update',
                payload: {
                    levelUp: { newLevel: 7 },
                    xpGained: 35,
                },
            });
        });

        expect(markLevelAsSeenMock).toHaveBeenCalledWith(7);
        expect(screen.getByText('level-up:7:35')).toBeInTheDocument();
    });
});
