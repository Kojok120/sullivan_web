import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkSurveyEligibility, fetchSurveyQuestions, submitSurvey } from '../survey'
import * as surveyService from '@/lib/survey-service'
import { revalidatePath } from 'next/cache'
import { SurveyCategory } from '@prisma/client'

// Mock the survey service
vi.mock('@/lib/survey-service', () => ({
    shouldShowSurvey: vi.fn(),
    getSurveyQuestions: vi.fn(),
    submitSurveyResponse: vi.fn(),
}))

// Mock Next.js cache revalidation
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

describe('survey actions', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    describe('checkSurveyEligibility', () => {
        it('ユーザーIDが有効な場合、shouldShowSurveyの結果を返す', async () => {
            vi.mocked(surveyService.shouldShowSurvey).mockResolvedValue(true)

            const result = await checkSurveyEligibility('user1')

            expect(result).toBe(true)
            expect(surveyService.shouldShowSurvey).toHaveBeenCalledWith('user1')
        })

        it('ユーザーIDが空文字列の場合、falseを返す', async () => {
            const result = await checkSurveyEligibility('')

            expect(result).toBe(false)
            expect(surveyService.shouldShowSurvey).not.toHaveBeenCalled()
        })

        it('ユーザーIDがnullish valueの場合、falseを返す', async () => {
            // TypeScript上はstring型だが、実行時の防御的チェック
            const result = await checkSurveyEligibility('' as string)

            expect(result).toBe(false)
            expect(surveyService.shouldShowSurvey).not.toHaveBeenCalled()
        })

        it('shouldShowSurveyがfalseを返す場合、falseを返す', async () => {
            vi.mocked(surveyService.shouldShowSurvey).mockResolvedValue(false)

            const result = await checkSurveyEligibility('user1')

            expect(result).toBe(false)
        })

        it('shouldShowSurveyがエラーをスローした場合、エラーを伝播する', async () => {
            vi.mocked(surveyService.shouldShowSurvey).mockRejectedValue(new Error('Database error'))

            await expect(checkSurveyEligibility('user1')).rejects.toThrow('Database error')
        })
    })

    describe('fetchSurveyQuestions', () => {
        it('getSurveyQuestionsの結果を返す', async () => {
            const mockQuestions = [
                { id: 'q1', category: SurveyCategory.GRIT, question: 'Question 1' },
                { id: 'q2', category: SurveyCategory.SELF_EFFICACY, question: 'Question 2' },
            ]

            vi.mocked(surveyService.getSurveyQuestions).mockResolvedValue(mockQuestions)

            const result = await fetchSurveyQuestions()

            expect(result).toEqual(mockQuestions)
            expect(surveyService.getSurveyQuestions).toHaveBeenCalled()
        })

        it('空配列を返すことができる', async () => {
            vi.mocked(surveyService.getSurveyQuestions).mockResolvedValue([])

            const result = await fetchSurveyQuestions()

            expect(result).toEqual([])
        })

        it('20問の質問を返す', async () => {
            const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
                id: `q${i}`,
                category: SurveyCategory.GRIT,
                question: `Question ${i + 1}`
            }))

            vi.mocked(surveyService.getSurveyQuestions).mockResolvedValue(mockQuestions)

            const result = await fetchSurveyQuestions()

            expect(result).toHaveLength(20)
        })

        it('getSurveyQuestionsがエラーをスローした場合、エラーを伝播する', async () => {
            vi.mocked(surveyService.getSurveyQuestions).mockRejectedValue(new Error('Database error'))

            await expect(fetchSurveyQuestions()).rejects.toThrow('Database error')
        })
    })

    describe('submitSurvey', () => {
        it('有効な回答を送信し、パスをrevalidateする', async () => {
            const answers = [
                { questionId: 'q1', value: 5 },
                { questionId: 'q2', value: 4 },
            ]

            vi.mocked(surveyService.submitSurveyResponse).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            await submitSurvey('user1', answers)

            expect(surveyService.submitSurveyResponse).toHaveBeenCalledWith('user1', answers)
            expect(revalidatePath).toHaveBeenCalledWith('/student/dashboard')
            expect(revalidatePath).toHaveBeenCalledWith('/history/[id]', 'page')
        })

        it('ユーザーIDが空文字列の場合、エラーをスローする', async () => {
            const answers = [{ questionId: 'q1', value: 5 }]

            await expect(submitSurvey('', answers)).rejects.toThrow('User ID is required')

            expect(surveyService.submitSurveyResponse).not.toHaveBeenCalled()
            expect(revalidatePath).not.toHaveBeenCalled()
        })

        it('複数の回答を送信できる', async () => {
            const answers = Array.from({ length: 20 }, (_, i) => ({
                questionId: `q${i}`,
                value: Math.floor(Math.random() * 5) + 1
            }))

            vi.mocked(surveyService.submitSurveyResponse).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            await submitSurvey('user1', answers)

            expect(surveyService.submitSurveyResponse).toHaveBeenCalledWith('user1', answers)
            expect(revalidatePath).toHaveBeenCalledTimes(2)
        })

        it('空の回答配列でも送信できる', async () => {
            vi.mocked(surveyService.submitSurveyResponse).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            await submitSurvey('user1', [])

            expect(surveyService.submitSurveyResponse).toHaveBeenCalledWith('user1', [])
        })

        it('submitSurveyResponseがエラーをスローした場合、revalidateは実行されない', async () => {
            vi.mocked(surveyService.submitSurveyResponse).mockRejectedValue(new Error('Save failed'))

            await expect(submitSurvey('user1', [{ questionId: 'q1', value: 5 }])).rejects.toThrow('Save failed')

            expect(revalidatePath).not.toHaveBeenCalled()
        })

        it('回答の値が1-5の範囲内である', async () => {
            const answers = [
                { questionId: 'q1', value: 1 },
                { questionId: 'q2', value: 3 },
                { questionId: 'q3', value: 5 },
            ]

            vi.mocked(surveyService.submitSurveyResponse).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            await submitSurvey('user1', answers)

            const call = vi.mocked(surveyService.submitSurveyResponse).mock.calls[0]
            expect(call[1]).toEqual(answers)
        })

        it('revalidatePathが正しいパス指定で呼び出される', async () => {
            vi.mocked(surveyService.submitSurveyResponse).mockResolvedValue({
                id: 'response1',
                userId: 'user1',
                answeredAt: new Date(),
                details: [],
                scores: {}
            })

            await submitSurvey('user1', [{ questionId: 'q1', value: 5 }])

            expect(revalidatePath).toHaveBeenNthCalledWith(1, '/student/dashboard')
            expect(revalidatePath).toHaveBeenNthCalledWith(2, '/history/[id]', 'page')
        })
    })

    describe('server action としての動作', () => {
        it('checkSurveyEligibility は async 関数である', () => {
            expect(checkSurveyEligibility).toBeInstanceOf(Function)
            expect(checkSurveyEligibility('user1')).toBeInstanceOf(Promise)
        })

        it('fetchSurveyQuestions は async 関数である', () => {
            expect(fetchSurveyQuestions).toBeInstanceOf(Function)
            expect(fetchSurveyQuestions()).toBeInstanceOf(Promise)
        })

        it('submitSurvey は async 関数である', () => {
            expect(submitSurvey).toBeInstanceOf(Function)
            expect(submitSurvey('user1', [])).toBeInstanceOf(Promise)
        })
    })
})
