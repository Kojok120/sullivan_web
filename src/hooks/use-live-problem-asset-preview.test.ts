import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLiveProblemAssetPreview } from './use-live-problem-asset-preview';

describe('useLiveProblemAssetPreview', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('有効なカードでは編集中の SVG をプレビュー用 asset として返す', async () => {
        vi.useFakeTimers();

        const syncHandler = vi.fn().mockResolvedValue({
            svgContent: '<svg width="320" height="240"><circle cx="10" cy="10" r="4" /></svg>',
        });
        const syncHandlerRef = {
            current: syncHandler,
        };

        const { result } = renderHook(() => useLiveProblemAssetPreview({
            authoringStateText: '{"base64":"dummy"}',
            cardId: 'card-1',
            enabled: true,
            syncHandlerRef,
        }));

        expect(result.current).toBeNull();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(syncHandler).toHaveBeenCalledTimes(1);
        expect(result.current?.cardId).toBe('card-1');
        expect(result.current?.asset.id).toBe('live-preview-card-1');
        expect(result.current?.asset.inlineContent).toContain('<svg');
    });
});
