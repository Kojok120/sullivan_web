import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { RankingServiceErrorMock, getSessionMock, getClassroomRankingPayloadMock } = vi.hoisted(() => {
    class RankingServiceErrorMock extends Error {
        status: number;

        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    }

    return {
        RankingServiceErrorMock,
        getSessionMock: vi.fn(),
        getClassroomRankingPayloadMock: vi.fn(),
    };
});

vi.mock('@/lib/auth', () => ({
    getSession: getSessionMock,
}));

vi.mock('@/lib/classroom-ranking-service', () => ({
    RankingServiceError: RankingServiceErrorMock,
    getClassroomRankingPayload: getClassroomRankingPayloadMock,
}));

import { GET } from '@/app/api/rankings/route';

describe('/api/rankings GET', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSessionMock.mockResolvedValue({
            userId: 'teacher-1',
            role: 'TEACHER',
        });
        getClassroomRankingPayloadMock.mockResolvedValue({
            classroom: { id: 'classroom-1', name: '渋谷教室' },
            timeZone: 'Asia/Tokyo',
            period: {
                key: '3m',
                label: '2026-02〜2026-04',
                startMonth: '2026-02',
                endMonth: '2026-04',
            },
            problemCount: [],
            vocabularyScore: [],
            accuracy: [],
        });
    });

    it('未認証なら 401 を返す', async () => {
        getSessionMock.mockResolvedValue(null);

        const response = await GET(new NextRequest('http://localhost/api/rankings'));

        expect(response.status).toBe(401);
    });

    it('レンジ指定をサービスへ渡して 200 を返す', async () => {
        const response = await GET(new NextRequest(
            'http://localhost/api/rankings?timeZone=Asia%2FTokyo&classroomId=classroom-1&range=custom&startMonth=2026-01&endMonth=2026-03',
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(getClassroomRankingPayloadMock).toHaveBeenCalledWith({
            actorUserId: 'teacher-1',
            actorRole: 'TEACHER',
            requestedClassroomId: 'classroom-1',
            timeZone: 'Asia/Tokyo',
            periodKey: 'custom',
            startMonth: '2026-01',
            endMonth: '2026-03',
        });
        expect(body.period.key).toBe('3m');
    });

    it('不正な range は 400 を返す', async () => {
        const response = await GET(new NextRequest('http://localhost/api/rankings?range=invalid'));

        expect(response.status).toBe(400);
        expect(getClassroomRankingPayloadMock).not.toHaveBeenCalled();
    });

    it('サービスの 400 エラーをそのまま返す', async () => {
        getClassroomRankingPayloadMock.mockRejectedValue(
            new RankingServiceErrorMock(400, '自由指定では開始月と終了月を指定してください'),
        );

        const response = await GET(new NextRequest('http://localhost/api/rankings?range=custom'));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({
            error: '自由指定では開始月と終了月を指定してください',
        });
    });
});
