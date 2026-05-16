import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
    ensureInitialCoreProblemStates,
    getEntryCoreProblemIds,
} from '@/lib/core-problem-entry-state'

vi.mock('@sullivan/db-schema', () => ({
    prisma: {
        coreProblem: {
            findMany: vi.fn(),
        },
        userCoreProblemState: {
            createMany: vi.fn(),
        },
    },
}))

describe('初回CoreProblem状態の初期化', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getEntryCoreProblemIds（教科ごとの先頭取得）', () => {
        it('教科ごとに最初のCoreProblem IDのみ返す', async () => {
            vi.mocked(prisma.coreProblem.findMany).mockResolvedValue([
                { id: 'cp-s1-a', subjectId: 's1' },
                { id: 'cp-s1-b', subjectId: 's1' },
                { id: 'cp-s2-a', subjectId: 's2' },
                { id: 'cp-s2-b', subjectId: 's2' },
            ] as Awaited<ReturnType<typeof prisma.coreProblem.findMany>>)

            const result = await getEntryCoreProblemIds()

            expect(result).toEqual(['cp-s1-a', 'cp-s2-a'])
            expect(prisma.coreProblem.findMany).toHaveBeenCalledWith({
                select: {
                    id: true,
                    subjectId: true,
                },
                orderBy: [
                    { subjectId: 'asc' },
                    { order: 'asc' },
                    { id: 'asc' },
                ],
            })
        })
    })

    describe('ensureInitialCoreProblemStates（初期状態作成）', () => {
        it('初回CoreProblem状態をcreateManyで作成する', async () => {
            vi.mocked(prisma.coreProblem.findMany).mockResolvedValue([
                { id: 'cp-s1-a', subjectId: 's1' },
                { id: 'cp-s1-b', subjectId: 's1' },
                { id: 'cp-s2-a', subjectId: 's2' },
            ] as Awaited<ReturnType<typeof prisma.coreProblem.findMany>>)
            vi.mocked(prisma.userCoreProblemState.createMany).mockResolvedValue({ count: 2 })

            const result = await ensureInitialCoreProblemStates('user-1')

            expect(result).toEqual({
                targetCount: 2,
                createdCount: 2,
            })
            expect(prisma.userCoreProblemState.createMany).toHaveBeenCalledOnce()

            const createManyArg = vi.mocked(prisma.userCoreProblemState.createMany).mock.calls[0]?.[0]
            expect(createManyArg).toBeDefined()
            if (!createManyArg) {
                throw new Error('createMany引数が取得できませんでした')
            }

            const rows = Array.isArray(createManyArg.data) ? createManyArg.data : [createManyArg.data]
            expect(createManyArg.skipDuplicates).toBe(true)
            expect(rows).toHaveLength(2)
            for (const row of rows) {
                expect(row.userId).toBe('user-1')
                expect(row.isUnlocked).toBe(true)
                expect(row.isLectureWatched).toBe(false)
                expect(row.lectureWatchedAt).toBeNull()
            }
        })

        it('CoreProblemがない場合は作成しない', async () => {
            vi.mocked(prisma.coreProblem.findMany).mockResolvedValue([] as Awaited<ReturnType<typeof prisma.coreProblem.findMany>>)

            const result = await ensureInitialCoreProblemStates('user-1')

            expect(result).toEqual({ targetCount: 0, createdCount: 0 })
            expect(prisma.userCoreProblemState.createMany).not.toHaveBeenCalled()
        })
    })
})
