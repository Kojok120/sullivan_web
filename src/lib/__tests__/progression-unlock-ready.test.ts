import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getReadyCoreProblemIds, getUnlockedCoreProblemIds } from '@/lib/progression'

vi.mock('@/lib/prisma', () => ({
    prisma: {
        coreProblem: {
            findMany: vi.fn(),
        },
        userCoreProblemState: {
            findMany: vi.fn(),
        },
        learningHistory: {
            findMany: vi.fn(),
        },
    },
}))

describe('progression unlock/ready rules', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('初回CoreProblemは状態未作成でもアンロックされる', async () => {
        vi.mocked(prisma.coreProblem.findMany).mockResolvedValue([
            { id: 'cp-2', order: 2 },
            { id: 'cp-1', order: 1 },
        ] as unknown as Awaited<ReturnType<typeof prisma.coreProblem.findMany>>)
        vi.mocked(prisma.userCoreProblemState.findMany).mockResolvedValue(
            [] as unknown as Awaited<ReturnType<typeof prisma.userCoreProblemState.findMany>>
        )
        vi.mocked(prisma.learningHistory.findMany).mockResolvedValue(
            [] as unknown as Awaited<ReturnType<typeof prisma.learningHistory.findMany>>
        )

        const result = await getUnlockedCoreProblemIds('user-1', 'subject-1')

        expect(result.has('cp-1')).toBe(true)
        expect(result.has('cp-2')).toBe(false)
        expect(prisma.coreProblem.findMany).toHaveBeenCalledWith({
            where: { subjectId: 'subject-1' },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, order: true },
        })
    })

    it('初回CoreProblemは講義動画があっても常時Ready', async () => {
        vi.mocked(prisma.coreProblem.findMany).mockResolvedValue([
            { id: 'cp-b', order: 1, lectureVideos: [{ title: 'v-b', url: 'https://example.com/b' }] },
            { id: 'cp-a', order: 1, lectureVideos: [{ title: 'v-a', url: 'https://example.com/a' }] },
            { id: 'cp-c', order: 2, lectureVideos: [] },
        ] as unknown as Awaited<ReturnType<typeof prisma.coreProblem.findMany>>)
        vi.mocked(prisma.userCoreProblemState.findMany).mockResolvedValue([
            { coreProblemId: 'cp-b', isLectureWatched: false },
            { coreProblemId: 'cp-c', isLectureWatched: false },
        ] as unknown as Awaited<ReturnType<typeof prisma.userCoreProblemState.findMany>>)

        const result = await getReadyCoreProblemIds('user-1', 'subject-1')

        expect(result.has('cp-a')).toBe(true)
        expect(result.has('cp-b')).toBe(false)
        expect(result.has('cp-c')).toBe(true)
        expect(prisma.coreProblem.findMany).toHaveBeenCalledWith({
            where: { subjectId: 'subject-1' },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, order: true, lectureVideos: true },
        })
    })
})
