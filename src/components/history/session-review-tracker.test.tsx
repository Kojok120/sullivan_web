import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionReviewTracker } from '@/components/history/session-review-tracker';

const { markSessionReviewedMock } = vi.hoisted(() => ({
    markSessionReviewedMock: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
    markSessionReviewed: markSessionReviewedMock,
}));

describe('SessionReviewTracker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        markSessionReviewedMock.mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mount 時に既読化 action を1回だけ呼ぶ', async () => {
        const { rerender } = render(<SessionReviewTracker groupId="group-1" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledWith('group-1');
        });
        expect(markSessionReviewedMock).toHaveBeenCalledTimes(1);

        rerender(<SessionReviewTracker groupId="group-1" />);
        expect(markSessionReviewedMock).toHaveBeenCalledTimes(1);
    });

    it('groupId が変わったときは新しい groupId で再度既読化する', async () => {
        const { rerender } = render(<SessionReviewTracker groupId="group-1" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledWith('group-1');
        });

        rerender(<SessionReviewTracker groupId="group-2" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledWith('group-2');
        });
        expect(markSessionReviewedMock).toHaveBeenCalledTimes(2);
    });

    it('既読化に失敗した後は同じ groupId でも再レンダー時に再試行できる', async () => {
        markSessionReviewedMock
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValueOnce(undefined);

        const { rerender } = render(<SessionReviewTracker groupId="group-1" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledTimes(1);
        });

        rerender(<SessionReviewTracker groupId="group-1" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledTimes(2);
        });
        expect(markSessionReviewedMock).toHaveBeenNthCalledWith(2, 'group-1');
    });
});
