import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionForMobileMock, getLegacyClassroomRankingPayloadMock } = vi.hoisted(() => ({
    getSessionForMobileMock: vi.fn(),
    getLegacyClassroomRankingPayloadMock: vi.fn(),
}));

vi.mock('@/lib/auth-mobile', () => ({
    getSessionForMobile: getSessionForMobileMock,
}));

vi.mock('@/lib/classroom-ranking-service', () => ({
    RankingServiceError: class RankingServiceError extends Error {
        status: number;

        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
    getLegacyClassroomRankingPayload: getLegacyClassroomRankingPayloadMock,
}));

import { GET } from '@/app/api/ios/rankings/route';

describe('/api/ios/rankings GET', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSessionForMobileMock.mockResolvedValue({
            userId: 'student-1',
            role: 'STUDENT',
        });
        getLegacyClassroomRankingPayloadMock.mockResolvedValue({
            classroom: { id: 'classroom-1', name: '渋谷教室' },
            timeZone: 'Asia/Tokyo',
            periods: {
                week: { label: '2026-04-06〜2026-04-12' },
                month: { label: '2026-04-01〜2026-04-30' },
            },
            problemCount: {
                week: [],
                month: [],
            },
            vocabularyScore: {
                week: [],
                month: [],
            },
        });
    });

    it('既存の週・月形式の payload を返す', async () => {
        const response = await GET(new NextRequest('http://localhost/api/ios/rankings?timeZone=Asia%2FTokyo'));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(getLegacyClassroomRankingPayloadMock).toHaveBeenCalledWith({
            actorUserId: 'student-1',
            actorRole: 'STUDENT',
            timeZone: 'Asia/Tokyo',
        });
        expect(body.periods.week.label).toBe('2026-04-06〜2026-04-12');
        expect(body.periods.month.label).toBe('2026-04-01〜2026-04-30');
    });
});
