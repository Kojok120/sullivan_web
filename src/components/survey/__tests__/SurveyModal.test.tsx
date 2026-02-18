import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SurveyModal } from '../SurveyModal'
import * as surveyActions from '@/actions/survey'
import { useRouter } from 'next/navigation'
import { SurveyCategory } from '@prisma/client'

// Mock Next.js router
vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}))

// Mock survey actions
vi.mock('@/actions/survey', () => ({
    fetchSurveyQuestions: vi.fn(),
    submitSurvey: vi.fn(),
}))

describe('SurveyModal', () => {
    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    }

    const mockQuestions = [
        { id: 'q1', category: SurveyCategory.GRIT, question: '難しい問題にぶつかっても、あきらめずに解き続けようとする。' },
        { id: 'q2', category: SurveyCategory.GRIT, question: '一度決めた目標は、最後までやり遂げる自信がある。' },
        { id: 'q3', category: SurveyCategory.SELF_EFFICACY, question: '勉強すれば、必ず成績は上がると信じている。' },
    ]

    async function renderLoadedSurveyModal(props?: { onComplete?: () => void }) {
        render(<SurveyModal userId="user1" {...props} />)
        await waitFor(() => {
            expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
        })
        return {
            allRadios: screen.getAllByRole('radio'),
            submitButton: screen.getByRole('button', { name: /回答を送信して結果を見る/ }),
        }
    }

    async function answerAndSubmit(options?: {
        onComplete?: () => void;
        radioIndexes?: [number, number, number];
    }) {
        const { allRadios, submitButton } = await renderLoadedSurveyModal({
            onComplete: options?.onComplete,
        })

        const [first, second, third] = options?.radioIndexes ?? [0, 5, 10]
        fireEvent.click(allRadios[first])
        fireEvent.click(allRadios[second])
        fireEvent.click(allRadios[third])
        fireEvent.click(submitButton)

        return { submitButton }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useRouter).mockReturnValue(mockRouter)
    })

    describe('初期表示', () => {
        it('ローディング中は何も表示しない', () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockImplementation(
                () => new Promise(() => { }) // 永遠に解決しないPromise
            )

            const { container } = render(<SurveyModal userId="user1" />)

            expect(container.firstChild).toBeNull()
        })

        it('質問が読み込まれたらモーダルを表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText('定期振り返りアンケート')).toBeInTheDocument()
            })
        })

        it('質問が空の場合、何も表示しない', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue([])

            const { container } = render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(container.firstChild).toBeNull()
            })
        })

        it('説明文を表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(/日頃の学習についての振り返りをお願いします/)).toBeInTheDocument()
            })
        })

        it('すべての質問を表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                mockQuestions.forEach(q => {
                    expect(screen.getByText(q.question)).toBeInTheDocument()
                })
            })
        })

        it('各質問に1-5の選択肢を表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                const radios = screen.getAllByRole('radio')
                // 3問 × 5選択肢 = 15個
                expect(radios).toHaveLength(15)
            })
        })
    })

    describe('質問への回答', () => {
        it('ラジオボタンを選択できる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
            })

            const firstQuestionRadios = screen.getAllByRole('radio', { name: /^[1-5]$/ })
            const firstRadio = firstQuestionRadios[2] // 3を選択

            fireEvent.click(firstRadio)

            expect(firstRadio).toBeChecked()
        })

        it('複数の質問に回答できる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
            })

            const allRadios = screen.getAllByRole('radio')

            // 各質問の3番目の選択肢を選択
            fireEvent.click(allRadios[2]) // q1: value 3
            fireEvent.click(allRadios[7]) // q2: value 3
            fireEvent.click(allRadios[12]) // q3: value 3

            expect(allRadios[2]).toBeChecked()
            expect(allRadios[7]).toBeChecked()
            expect(allRadios[12]).toBeChecked()
        })

        it('同じ質問内で選択を変更できる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
            })

            const allRadios = screen.getAllByRole('radio')

            // 最初に3を選択
            fireEvent.click(allRadios[2])
            expect(allRadios[2]).toBeChecked()

            // 5に変更
            fireEvent.click(allRadios[4])
            expect(allRadios[4]).toBeChecked()
            expect(allRadios[2]).not.toBeChecked()
        })
    })

    describe('送信ボタン', () => {
        it('初期状態では送信ボタンが無効である', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                const submitButton = screen.getByRole('button', { name: /回答を送信して結果を見る/ })
                expect(submitButton).toBeDisabled()
            })
        })

        it('すべての質問に回答すると送信ボタンが有効になる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
            })

            const allRadios = screen.getAllByRole('radio')

            // すべての質問に回答
            fireEvent.click(allRadios[0]) // q1
            fireEvent.click(allRadios[5]) // q2
            fireEvent.click(allRadios[10]) // q3

            await waitFor(() => {
                const submitButton = screen.getByRole('button', { name: /回答を送信して結果を見る/ })
                expect(submitButton).not.toBeDisabled()
            })
        })

        it('一部の質問にのみ回答した場合、送信ボタンは無効のまま', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(mockQuestions[0].question)).toBeInTheDocument()
            })

            const allRadios = screen.getAllByRole('radio')

            // 2問だけ回答
            fireEvent.click(allRadios[0])
            fireEvent.click(allRadios[5])

            const submitButton = screen.getByRole('button', { name: /回答を送信して結果を見る/ })
            expect(submitButton).toBeDisabled()
        })

        it('未回答時に警告メッセージを表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText(/すべての質問に回答してください/)).toBeInTheDocument()
            })
        })
    })

    describe('送信処理', () => {
        it('すべての質問に回答して送信すると、submitSurveyが呼ばれる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockResolvedValue(undefined)

            await answerAndSubmit({ radioIndexes: [4, 8, 12] })

            await waitFor(() => {
                expect(surveyActions.submitSurvey).toHaveBeenCalledWith('user1', [
                    { questionId: 'q1', value: 5 },
                    { questionId: 'q2', value: 4 },
                    { questionId: 'q3', value: 3 },
                ])
            })
        })

        it('送信中はボタンが無効になり、送信中テキストを表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockImplementation(
                () => new Promise(resolve => setTimeout(resolve, 100))
            )

            const { submitButton } = await answerAndSubmit()

            expect(screen.getByText('送信中...')).toBeInTheDocument()
            expect(submitButton).toBeDisabled()
        })

        it('送信完了後、router.refreshが呼ばれる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockResolvedValue(undefined)

            await answerAndSubmit()

            await waitFor(() => {
                expect(mockRouter.refresh).toHaveBeenCalled()
            })
        })

        it('onCompleteコールバックが指定されている場合、送信完了後に呼ばれる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockResolvedValue(undefined)
            const onComplete = vi.fn()

            await answerAndSubmit({ onComplete })

            await waitFor(() => {
                expect(onComplete).toHaveBeenCalled()
            })
        })

        it('送信失敗時、アラートを表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockRejectedValue(new Error('Network error'))
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { })

            await answerAndSubmit()

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith('送信に失敗しました。もう一度お試しください。')
            })

            alertSpy.mockRestore()
        })

        it('送信失敗後、ボタンが再度有効になる', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)
            vi.mocked(surveyActions.submitSurvey).mockRejectedValue(new Error('Network error'))
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { })

            const { submitButton } = await answerAndSubmit()

            await waitFor(() => {
                expect(submitButton).not.toBeDisabled()
            })

            alertSpy.mockRestore()
        })
    })

    describe('質問番号の表示', () => {
        it('各質問に番号を表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(screen.getByText('Q1.')).toBeInTheDocument()
                expect(screen.getByText('Q2.')).toBeInTheDocument()
                expect(screen.getByText('Q3.')).toBeInTheDocument()
            })
        })
    })

    describe('選択肢のラベル', () => {
        it('「まったくあてはまらない」「とてもあてはまる」のラベルを表示する', async () => {
            vi.mocked(surveyActions.fetchSurveyQuestions).mockResolvedValue(mockQuestions)

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                const labels = screen.getAllByText(/まったく.*あてはまらない/)
                expect(labels.length).toBeGreaterThan(0)
            })

            const labels = screen.getAllByText(/とても.*あてはまる/)
            expect(labels.length).toBeGreaterThan(0)
        })
    })

    describe('エラーハンドリング', () => {
        it('質問の読み込み失敗時、コンソールエラーを出力する', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
            vi.mocked(surveyActions.fetchSurveyQuestions).mockRejectedValue(new Error('Load failed'))

            render(<SurveyModal userId="user1" />)

            await waitFor(() => {
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load survey questions', expect.any(Error))
            })

            consoleErrorSpy.mockRestore()
        })
    })
})
