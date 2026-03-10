'use client';

import { useEffect, useRef } from 'react';

import { markSessionReviewed } from '@/app/actions';

type SessionReviewTrackerProps = {
    groupId: string;
};

export function SessionReviewTracker({ groupId }: SessionReviewTrackerProps) {
    const hasRequestedRef = useRef(false);

    useEffect(() => {
        if (!groupId || hasRequestedRef.current) {
            return;
        }

        hasRequestedRef.current = true;
        void Promise.resolve(markSessionReviewed(groupId)).catch((error) => {
            console.error('[SessionReviewTracker] 既読更新に失敗しました:', error);
        });
    }, [groupId]);

    return null;
}
