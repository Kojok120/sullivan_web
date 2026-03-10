'use client';

import { useEffect, useRef } from 'react';

import { markSessionReviewed } from '@/app/actions';

type SessionReviewTrackerProps = {
    groupId: string;
};

export function SessionReviewTracker({ groupId }: SessionReviewTrackerProps) {
    const requestedGroupIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!groupId || requestedGroupIdRef.current === groupId) {
            return;
        }

        requestedGroupIdRef.current = groupId;
        void markSessionReviewed(groupId).catch((error) => {
            if (requestedGroupIdRef.current === groupId) {
                requestedGroupIdRef.current = null;
            }
            console.error('[SessionReviewTracker] 既読更新に失敗しました:', error);
        });
    });

    return null;
}
