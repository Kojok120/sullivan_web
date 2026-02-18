import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    shouldShowSurvey,
    getSurveyQuestions,
    submitSurveyResponse,
    SURVEY_CATEGORIES,
    SURVEY_INTERVAL_DAYS
} from '../survey-service'
import { prisma } from '@/lib/prisma'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        surveyResponse: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        questionBank: {
            findMany: vi.fn(),
        },
    },
}))

describe('survey-service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('shouldShowSurvey', () => {
        it('ユーザーが一度も回答していない場合、trueを返す', async () => {
            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue(null)

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(true)
            expect(prisma.surveyResponse.findFirst).toHaveBeenCalledWith({
                where: { userId: 'user1' },
                orderBy: { answeredAt: 'desc' },
                select: { answeredAt: true }
            })
        })

        it('前回の回答から90日以上経過している場合、trueを返す', async () => {
            const ninetyOneDaysAgo = new Date()
            ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91)

            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
                answeredAt: ninetyOneDaysAgo
            })

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(true)
        })

        it('前回の回答からちょうど90日経過している場合、trueを返す', async () => {
            const exactlyNinetyDaysAgo = new Date()
            exactlyNinetyDaysAgo.setDate(exactlyNinetyDaysAgo.getDate() - 90)

            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
                answeredAt: exactlyNinetyDaysAgo
            })

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(true)
        })

        it('前回の回答から90日未満の場合、falseを返す', async () => {
            const recentDate = new Date()
            recentDate.setDate(recentDate.getDate() - 30) // 30日前

            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
                answeredAt: recentDate
            })

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(false)
        })

        it('前回の回答が1日前の場合、falseを返す', async () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)

            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
                answeredAt: yesterday
            })

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(false)
        })

        it('前回の回答が今日の場合、falseを返す', async () => {
            const today = new Date()

            vi.mocked(prisma.surveyResponse.findFirst).mockResolvedValue({
                answeredAt: today
            })

            const result = await shouldShowSurvey('user1')

            expect(result).toBe(false)
        })
    })

    describe('getSurveyQuestions', () => {
        it('各カテゴリーから4問ずつ、合計20問を返す', async () => {
            // 各カテゴリー20問ずつ、合計100問を用意
            const mockQuestions = SURVEY_CATEGORIES.flatMap((category) =>
                Array.from({ length: 20 }, (_, i) => ({
                    id: `${category}-${i}`,
                    category,
                    question: `Question ${i + 1} for ${category}`,
                    createdAt: new Date()
                }))
            )

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)

            const result = await getSurveyQuestions()

            expect(result).toHaveLength(20)
            expect(prisma.questionBank.findMany).toHaveBeenCalled()
        })

        it('5つのカテゴリーすべてが含まれる', async () => {
            const mockQuestions = SURVEY_CATEGORIES.flatMap((category) =>
                Array.from({ length: 20 }, (_, i) => ({
                    id: `${category}-${i}`,
                    category,
                    question: `Question ${i + 1} for ${category}`,
                    createdAt: new Date()
                }))
            )

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)

            const result = await getSurveyQuestions()

            const categories = new Set(result.map(q => q.category))
            expect(categories.size).toBe(5)
            SURVEY_CATEGORIES.forEach(cat => {
                expect(categories.has(cat)).toBe(true)
            })
        })

        it('各カテゴリーから4問ずつ選択される', async () => {
            const mockQuestions = SURVEY_CATEGORIES.flatMap((category) =>
                Array.from({ length: 20 }, (_, i) => ({
                    id: `${category}-${i}`,
                    category,
                    question: `Question ${i + 1} for ${category}`,
                    createdAt: new Date()
                }))
            )

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)

            const result = await getSurveyQuestions()

            SURVEY_CATEGORIES.forEach(category => {
                const categoryQuestions = result.filter(q => q.category === category)
                expect(categoryQuestions).toHaveLength(4)
            })
        })

        it('質問が空の場合、空配列を返す', async () => {
            vi.mocked(prisma.questionBank.findMany).mockResolvedValue([])

            const result = await getSurveyQuestions()

            expect(result).toHaveLength(0)
        })

        it('一部のカテゴリーに質問が不足している場合も動作する', async () => {
            // GRIT: 2問、SELF_EFFICACY: 4問、他: 20問ずつ
            const mockQuestions = [
                ...Array.from({ length: 2 }, (_, i) => ({
                    id: `GRIT-${i}`,
                    category: 'GRIT',
                    question: `GRIT Question ${i + 1}`,
                    createdAt: new Date()
                })),
                ...Array.from({ length: 4 }, (_, i) => ({
                    id: `SELF_EFFICACY-${i}`,
                    category: 'SELF_EFFICACY',
                    question: `SELF_EFFICACY Question ${i + 1}`,
                    createdAt: new Date()
                })),
                ...['SELF_REGULATION', 'GROWTH_MINDSET', 'EMOTIONAL_REGULATION'].flatMap((category) =>
                    Array.from({ length: 20 }, (_, i) => ({
                        id: `${category}-${i}`,
                        category,
                        question: `Question ${i + 1} for ${category}`,
                        createdAt: new Date()
                    }))
                )
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)

            const result = await getSurveyQuestions()

            // GRITは2問しかないので2問、SELF_EFFICACYは4問、他は4問ずつ = 2+4+4+4+4 = 18問
            expect(result.length).toBeLessThanOrEqual(20)
        })
    })

    describe('submitSurveyResponse', () => {
        it('回答を保存し、カテゴリー別スコアを計算する', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Q1', createdAt: new Date() },
                { id: 'q2', category: 'GRIT', question: 'Q2', createdAt: new Date() },
                { id: 'q3', category: 'SELF_EFFICACY', question: 'Q3', createdAt: new Date() },
                { id: 'q4', category: 'SELF_EFFICACY', question: 'Q4', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)

            const mockSavedResponse = {
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            }
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue(mockSavedResponse)

            const answers = [
                { questionId: 'q1', value: 5 },
                { questionId: 'q2', value: 3 },
                { questionId: 'q3', value: 4 },
                { questionId: 'q4', value: 2 },
            ]

            await submitSurveyResponse('user1', answers)

            expect(prisma.questionBank.findMany).toHaveBeenCalledWith({
                where: { id: { in: ['q1', 'q2', 'q3', 'q4'] } }
            })

            expect(prisma.surveyResponse.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: 'user1',
                    details: expect.arrayContaining([
                        expect.objectContaining({ questionId: 'q1', value: 5, category: 'GRIT' }),
                        expect.objectContaining({ questionId: 'q2', value: 3, category: 'GRIT' }),
                        expect.objectContaining({ questionId: 'q3', value: 4, category: 'SELF_EFFICACY' }),
                        expect.objectContaining({ questionId: 'q4', value: 2, category: 'SELF_EFFICACY' }),
                    ]),
                    scores: expect.objectContaining({
                        GRIT: 4.0, // (5 + 3) / 2 = 4.0
                        SELF_EFFICACY: 3.0, // (4 + 2) / 2 = 3.0
                    }),
                })
            })
        })

        it('カテゴリー別の平均スコアを正しく計算する', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Q1', createdAt: new Date() },
                { id: 'q2', category: 'GRIT', question: 'Q2', createdAt: new Date() },
                { id: 'q3', category: 'GRIT', question: 'Q3', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            const answers = [
                { questionId: 'q1', value: 5 },
                { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 3 },
            ]

            await submitSurveyResponse('user1', answers)

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const scores = createCall.data.scores as Record<string, number>

            expect(scores.GRIT).toBeCloseTo(4.0, 2) // (5 + 4 + 3) / 3 = 4.0
        })

        it('複数カテゴリーの回答から正しくスコアを計算する', async () => {
            const mockQuestions = SURVEY_CATEGORIES.flatMap((category) =>
                Array.from({ length: 4 }, (_, i) => ({
                    id: `${category}-${i}`,
                    category,
                    question: `Q${i}`,
                    createdAt: new Date()
                }))
            )

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            const answers = mockQuestions.map(q => ({
                questionId: q.id,
                value: 5
            }))

            await submitSurveyResponse('user1', answers)

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const scores = createCall.data.scores as Record<string, number>

            SURVEY_CATEGORIES.forEach(category => {
                expect(scores[category]).toBe(5.0)
            })
        })

        it('detailsに質問テキストとカテゴリー情報を含む', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Grit Question 1', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            const answers = [{ questionId: 'q1', value: 5 }]

            await submitSurveyResponse('user1', answers)

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const details = createCall.data.details as Array<any>

            expect(details[0]).toEqual({
                questionId: 'q1',
                question: 'Grit Question 1',
                category: 'GRIT',
                value: 5
            })
        })

        it('存在しない質問IDは無視される', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Q1', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            const answers = [
                { questionId: 'q1', value: 5 },
                { questionId: 'invalid', value: 3 }, // 存在しない質問
            ]

            await submitSurveyResponse('user1', answers)

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const details = createCall.data.details as Array<any>

            expect(details).toHaveLength(1)
            expect(details[0].questionId).toBe('q1')
        })

        it('スコアを小数点第2位まで丸める', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Q1', createdAt: new Date() },
                { id: 'q2', category: 'GRIT', question: 'Q2', createdAt: new Date() },
                { id: 'q3', category: 'GRIT', question: 'Q3', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            // 5 + 4 + 4 = 13, 13 / 3 = 4.333...
            const answers = [
                { questionId: 'q1', value: 5 },
                { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 4 },
            ]

            await submitSurveyResponse('user1', answers)

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const scores = createCall.data.scores as Record<string, number>

            expect(scores.GRIT).toBe(4.33)
        })

        it('answeredAtが現在時刻に近い値で保存される', async () => {
            const mockQuestions = [
                { id: 'q1', category: 'GRIT', question: 'Q1', createdAt: new Date() },
            ]

            vi.mocked(prisma.questionBank.findMany).mockResolvedValue(mockQuestions)
            vi.mocked(prisma.surveyResponse.create).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            const beforeSubmit = new Date()
            await submitSurveyResponse('user1', [{ questionId: 'q1', value: 5 }])
            const afterSubmit = new Date()

            const createCall = vi.mocked(prisma.surveyResponse.create).mock.calls[0][0]
            const answeredAt = createCall.data.answeredAt as Date

            expect(answeredAt.getTime()).toBeGreaterThanOrEqual(beforeSubmit.getTime())
            expect(answeredAt.getTime()).toBeLessThanOrEqual(afterSubmit.getTime())
        })
    })

    describe('SURVEY_CATEGORIES', () => {
        it('5つのカテゴリーが定義されている', () => {
            expect(SURVEY_CATEGORIES).toHaveLength(5)
        })

        it('期待されるカテゴリーがすべて含まれている', () => {
            expect(SURVEY_CATEGORIES).toContain('GRIT')
            expect(SURVEY_CATEGORIES).toContain('SELF_EFFICACY')
            expect(SURVEY_CATEGORIES).toContain('SELF_REGULATION')
            expect(SURVEY_CATEGORIES).toContain('GROWTH_MINDSET')
            expect(SURVEY_CATEGORIES).toContain('EMOTIONAL_REGULATION')
        })
    })

    describe('SURVEY_INTERVAL_DAYS', () => {
        it('90日に設定されている', () => {
            expect(SURVEY_INTERVAL_DAYS).toBe(90)
        })
    })
})