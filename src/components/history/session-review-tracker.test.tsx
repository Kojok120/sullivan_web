import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionReviewTracker } from '@/components/history/session-review-tracker';

const { markSessionReviewedMock } = vi.hoisted(() => ({
    markSessionReviewedMock: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
    markSessionReviewed: markSessionReviewedMock,
}));

describe('SessionReviewTracker', () => {
    it('mount 時に既読化 action を1回だけ呼ぶ', async () => {
        const { rerender } = render(<SessionReviewTracker groupId="group-1" />);

        await waitFor(() => {
            expect(markSessionReviewedMock).toHaveBeenCalledWith('group-1');
        });
        expect(markSessionReviewedMock).toHaveBeenCalledTimes(1);

        rerender(<SessionReviewTracker groupId="group-1" />);
        expect(markSessionReviewedMock).toHaveBeenCalledTimes(1);
    });
});
