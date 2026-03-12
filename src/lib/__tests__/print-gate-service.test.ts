import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getPrintGate } from '@/lib/print-gate-service'

vi.mock('@/lib/prisma', () => ({
    prisma: {
        userCoreProblemState: {
            findMany: vi.fn(),
        },
    },
}))

describe('print-gate-service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('未視聴講義がなければblocked=falseを返す', async () => {
        vi.mocked(prisma.userCoreProblemState.findMany).mockResolvedValue([] as Awaited<ReturnType<typeof prisma.userCoreProblemState.findMany>>)

        const result = await getPrintGate('user-1', 'subject-1')

        expect(result).toEqual({ blocked: false })
        expect(prisma.userCoreProblemState.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'user-1',
                isUnlocked: true,
                isLectureWatched: false,
                coreProblem: {
                    subjectId: 'subject-1',
                },
            },
            include: {
                coreProblem: {
                    select: {
                        id: true,
                        name: true,
                        order: true,
                        lectureVideos: true,
                    },
                },
            },
        })
    })

    it('講義動画ありの未視聴単元があればblocked=trueを返す', async () => {
        vi.mocked(prisma.userCoreProblemState.findMany).mockResolvedValue([
            {
                coreProblem: {
                    id: 'cp-2',
                    name: 'be動詞と一般動詞',
                    order: 2,
                    lectureVideos: [{ title: 'v2', url: 'https://example.com/2' }],
                },
            },
            {
                coreProblem: {
                    id: 'cp-1',
                    name: '主語と動詞',
                    order: 1,
                    lectureVideos: [
                        { title: 'v1', url: 'https://example.com/1' },
                        { title: '', url: '' },
                    ],
                },
            },
        ] as unknown as Awaited<ReturnType<typeof prisma.userCoreProblemState.findMany>>)

        const result = await getPrintGate('user-1', 'subject-1')

        expect(result).toEqual({
            blocked: true,
            coreProblemId: 'cp-1',
            coreProblemName: '主語と動詞',
            lectureVideos: [{ title: 'v1', url: 'https://example.com/1' }],
        })
    })

    it('lectureVideosが空の単元はブロック対象にしない', async () => {
        vi.mocked(prisma.userCoreProblemState.findMany).mockResolvedValue([
            {
                coreProblem: {
                    id: 'cp-1',
                    name: '主語と動詞',
                    order: 1,
                    lectureVideos: [],
                },
            },
        ] as unknown as Awaited<ReturnType<typeof prisma.userCoreProblemState.findMany>>)

        const result = await getPrintGate('user-1', 'subject-1')

        expect(result).toEqual({ blocked: false })
    })
})
