import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    userFindUniqueMock,
    subjectFindUniqueMock,
    learningHistoryFindManyMock,
    coreProblemFindUniqueMock,
    selectProblemsForPrintMock,
    encodeUnitTokenMock,
} = vi.hoisted(() => ({
    userFindUniqueMock: vi.fn(),
    subjectFindUniqueMock: vi.fn(),
    learningHistoryFindManyMock: vi.fn(),
    coreProblemFindUniqueMock: vi.fn(),
    selectProblemsForPrintMock: vi.fn(),
    encodeUnitTokenMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: userFindUniqueMock,
        },
        subject: {
            findUnique: subjectFindUniqueMock,
        },
        learningHistory: {
            findMany: learningHistoryFindManyMock,
        },
        coreProblem: {
            findUnique: coreProblemFindUniqueMock,
        },
    },
}))

vi.mock('@/lib/print-algo', () => ({
    selectProblemsForPrint: selectProblemsForPrintMock,
}))

vi.mock('@/lib/qr-utils', () => ({
    encodeUnitToken: encodeUnitTokenMock,
}))

import { getPrintData } from '@/lib/print-service'

function createHistoryEntries(count: number, subjectId = 'subject-1') {
    return Array.from({ length: count }, (_value, index) => ({
        problem: {
            id: `problem-${index + 1}`,
            customId: `E-${index + 1}`,
            question: `問題${index + 1}`,
            order: index + 1,
            subjectId,
        },
    }))
}

describe('getPrintData', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        userFindUniqueMock.mockResolvedValue({ name: '生徒', loginId: 'S0001' })
        subjectFindUniqueMock.mockResolvedValue({ name: '英語' })
        learningHistoryFindManyMock.mockResolvedValue([])
        coreProblemFindUniqueMock.mockResolvedValue(null)
        selectProblemsForPrintMock.mockResolvedValue([])
        encodeUnitTokenMock.mockReturnValue('unit-token')
    })

    it('groupId 指定時は履歴順の問題セットを返し、10問ごとに分割する', async () => {
        learningHistoryFindManyMock.mockResolvedValue(createHistoryEntries(20))

        const result = await getPrintData('user-1', 'subject-1', undefined, 1, 'group-1')

        expect(selectProblemsForPrintMock).not.toHaveBeenCalled()
        expect(learningHistoryFindManyMock).toHaveBeenCalledWith({
            where: { userId: 'user-1', groupId: 'group-1' },
            select: {
                problem: {
                    select: {
                        id: true,
                        customId: true,
                        question: true,
                        order: true,
                        subjectId: true,
                    },
                },
            },
            orderBy: { id: 'asc' },
        })
        expect(result?.problems.map((problem) => problem.id)).toEqual([
            'problem-1',
            'problem-2',
            'problem-3',
            'problem-4',
            'problem-5',
            'problem-6',
            'problem-7',
            'problem-8',
            'problem-9',
            'problem-10',
            'problem-11',
            'problem-12',
            'problem-13',
            'problem-14',
            'problem-15',
            'problem-16',
            'problem-17',
            'problem-18',
            'problem-19',
            'problem-20',
        ])
        expect(result?.problemSets).toHaveLength(2)
        expect(result?.problemSets[0]).toHaveLength(10)
        expect(result?.problemSets[1]).toHaveLength(10)
    })

    it('groupId の履歴が空なら null を返す', async () => {
        learningHistoryFindManyMock.mockResolvedValue([])

        const result = await getPrintData('user-1', 'subject-1', undefined, 1, 'group-1')

        expect(result).toBeNull()
    })

    it('groupId の履歴が複数教科に跨る場合は null を返す', async () => {
        learningHistoryFindManyMock.mockResolvedValue([
            ...createHistoryEntries(1, 'subject-1'),
            ...createHistoryEntries(1, 'subject-2'),
        ])

        const result = await getPrintData('user-1', 'subject-1', undefined, 1, 'group-1')

        expect(result).toBeNull()
    })

    it('groupId の履歴教科がリクエスト subjectId と一致しない場合は null を返す', async () => {
        learningHistoryFindManyMock.mockResolvedValue(createHistoryEntries(2, 'subject-2'))

        const result = await getPrintData('user-1', 'subject-1', undefined, 1, 'group-1')

        expect(result).toBeNull()
    })
})
