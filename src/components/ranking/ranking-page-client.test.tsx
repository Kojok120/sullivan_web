import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RankingPageClient } from '@/components/ranking/ranking-page-client';
import type { RankingResponse } from '@/lib/types/ranking';

function createPayload(overrides?: Partial<RankingResponse>): RankingResponse {
    return {
        classroom: {
            id: 'classroom-1',
            name: '渋谷教室',
        },
        timeZone: 'Asia/Tokyo',
        period: {
            key: '1m',
            label: '2026-04',
            startMonth: '2026-04',
            endMonth: '2026-04',
        },
        problemCount: [
            {
                rank: 1,
                userId: 'student-1',
                name: '青木',
                loginId: 'aoki',
                group: 'A',
                value: 12,
            },
        ],
        vocabularyScore: [
            {
                rank: 1,
                userId: 'student-2',
                name: '井上',
                loginId: 'inoue',
                group: 'B',
                value: 320,
            },
        ],
        accuracy: [
            {
                rank: 1,
                userId: 'student-3',
                name: '上田',
                loginId: 'ueda',
                group: 'C',
                value: 95,
            },
        ],
        ...overrides,
    };
}

describe('RankingPageClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('3つの指標タブを切り替えて表示できる', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify(createPayload()), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
        ));

        render(
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="説明"
            />,
        );

        await waitFor(() => {
            expect(screen.getByText('青木')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '英単語スコア' }));
        expect(await screen.findByText('井上')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '正答率' }));
        expect(await screen.findByText('上田')).toBeInTheDocument();
    });

    it('今月・3ヶ月・1年の切り替えで再取得して期間表示を更新する', async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
            const range = url.searchParams.get('range') ?? '1m';

            if (range === '3m') {
                return new Response(JSON.stringify(createPayload({
                    period: {
                        key: '3m',
                        label: '2026-02〜2026-04',
                        startMonth: '2026-02',
                        endMonth: '2026-04',
                    },
                })), { status: 200 });
            }

            if (range === '12m') {
                return new Response(JSON.stringify(createPayload({
                    period: {
                        key: '12m',
                        label: '2025-05〜2026-04',
                        startMonth: '2025-05',
                        endMonth: '2026-04',
                    },
                })), { status: 200 });
            }

            return new Response(JSON.stringify(createPayload()), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="説明"
            />,
        );

        expect(await screen.findByText('2026-04')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '3ヶ月' }));
        expect(await screen.findByText('2026-02〜2026-04')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '1年' }));
        expect(await screen.findByText('2025-05〜2026-04')).toBeInTheDocument();

        const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(calledUrls.some((url) => url.includes('range=1m'))).toBe(true);
        expect(calledUrls.some((url) => url.includes('range=3m'))).toBe(true);
        expect(calledUrls.some((url) => url.includes('range=12m'))).toBe(true);
    });

    it('自由指定では月入力を表示し、不正な入力中は取得しない', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(createPayload()), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        render(
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="説明"
            />,
        );

        await screen.findByText('2026-04');
        fetchMock.mockClear();

        fireEvent.click(screen.getByRole('button', { name: '自由指定' }));

        expect(await screen.findByLabelText('開始月')).toBeInTheDocument();
        expect(screen.getByText('開始月と終了月を選択してください。')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('開始月'), { target: { value: '2026-04' } });
        fireEvent.change(screen.getByLabelText('終了月'), { target: { value: '2026-03' } });

        await waitFor(() => {
            expect(screen.getByText('開始月は終了月以前を指定してください。')).toBeInTheDocument();
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('自由指定の有効な期間では再取得する', async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
            const range = url.searchParams.get('range') ?? '1m';

            if (range === 'custom') {
                return new Response(JSON.stringify(createPayload({
                    period: {
                        key: 'custom',
                        label: '2026-01〜2026-03',
                        startMonth: '2026-01',
                        endMonth: '2026-03',
                    },
                })), { status: 200 });
            }

            return new Response(JSON.stringify(createPayload()), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <RankingPageClient
                apiPath="/api/rankings"
                heading="教室ランキング"
                description="説明"
            />,
        );

        await screen.findByText('2026-04');
        fetchMock.mockClear();

        fireEvent.click(screen.getByRole('button', { name: '自由指定' }));
        fireEvent.change(screen.getByLabelText('開始月'), { target: { value: '2026-01' } });
        fireEvent.change(screen.getByLabelText('終了月'), { target: { value: '2026-03' } });

        expect(await screen.findByText('2026-01〜2026-03')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalled();
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('range=custom'))).toBe(true);
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('startMonth=2026-01'))).toBe(true);
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('endMonth=2026-03'))).toBe(true);
    });
});
